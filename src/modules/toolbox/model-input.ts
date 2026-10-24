import {MAX_MODEL_TRIANGLES} from './types'

export const MAX_MODEL_FILE_BYTES=32*1024*1024, MAX_MODEL_FILES_BYTES=64*1024*1024
export function validateModelFiles(files: readonly {name:string;size:number}[]) {
  if(!files.length || files.length>128 || files.some(file=>!Number.isSafeInteger(file.size)||file.size<0) || files.reduce((sum,file)=>sum+file.size,0)>MAX_MODEL_FILES_BYTES) throw new Error('模型及附件总大小不能超过 64 MiB，文件数最多 128。')
  const primary=files.filter(file=>/\.(obj|stl|glb|gltf)$/i.test(file.name))
  if(primary.length!==1)throw new Error('请选择一个模型，可同时选择 MTL、BIN 和纹理图片。')
  if(primary[0].size>MAX_MODEL_FILE_BYTES)throw new Error('模型文件不能超过 32 MiB。')
}
export function modelPath(path:string,decode=false) {
  if(decode){try{path=decodeURIComponent(path)}catch{throw new Error('模型资源路径编码无效。')}}
  return path.replace(/\\/g,'/').replace(/^(\.\/)+/,'')
}
/** Preflight ASCII mesh declarations before Three allocates expanded geometry. */
export function checkMeshText(text:string, format:'obj'|'stl') {
  let triangles=0,vertices=0
  for(let start=0;start<text.length;) {
    let end=text.indexOf('\n',start);if(end<0)end=text.length
    const line=text.slice(start,end).trimStart();start=end+1
    if(format==='obj') {
      if(/^v\s/.test(line) && ++vertices>MAX_MODEL_TRIANGLES*3)throw new Error('模型顶点超过 60 万，请先简化模型。')
      if(/^f\s/.test(line)) {
        let fields=0
        for(const _ of line.split('#',1)[0].matchAll(/\S+/g))fields++
        triangles+=Math.max(0,fields-3)
      }
    } else if(/^facet\s+normal\b/i.test(line)) triangles++
    if(triangles>MAX_MODEL_TRIANGLES)throw new Error('模型不能超过 20 万个三角面。')
  }
}
export function checkStl(buffer:ArrayBuffer) {
  if(buffer.byteLength>=84) {
    const count=new DataView(buffer).getUint32(80,true)
    if(84+count*50===buffer.byteLength) {
      if(count>MAX_MODEL_TRIANGLES)throw new Error('模型不能超过 20 万个三角面。')
      return
    }
  }
  const text=new TextDecoder().decode(buffer)
  if(!/^\s*solid\b/i.test(text))throw new Error('STL 文件头或长度无效。')
  checkMeshText(text,'stl')
}
/** Bound declared allocations before GLTFLoader expands sparse accessors or node instances. */
export function checkGltf(buffer:ArrayBuffer) {
  let bytes = new Uint8Array(buffer)
  if (buffer.byteLength >= 4 && new DataView(buffer).getUint32(0,true) === 0x46546c67) {
    const view = new DataView(buffer)
    if (buffer.byteLength < 20 || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== buffer.byteLength || view.getUint32(16,true) !== 0x4e4f534a) throw new Error('GLB 文件头或 JSON 块无效。')
    const length = view.getUint32(12,true)
    if (length > buffer.byteLength - 20) throw new Error('GLB JSON 块超出文件长度。')
    bytes = bytes.subarray(20,20+length)
  }
  const json = JSON.parse(new TextDecoder().decode(bytes))
  if (!json || json.asset?.version !== '2.0') throw new Error('仅支持 glTF 2.0 模型。')
  const accessors = json.accessors ?? [], nodes = json.nodes ?? [], meshes = json.meshes ?? []
  if (![accessors,nodes,meshes].every(Array.isArray) || accessors.length > 20000 || nodes.length > 20000 || meshes.length > 20000) throw new Error('GLTF 结构数量超过限制。')
  const widths: Record<string,number> = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16}
  let allocation = 0, bufferBytes = 0
  for (const accessor of accessors) {
    if (!Number.isSafeInteger(accessor.count) || accessor.count < 0 || accessor.count > MAX_MODEL_TRIANGLES*3 || !widths[accessor.type]) throw new Error('GLTF 顶点或属性数量无效／过大。')
    allocation += accessor.count * widths[accessor.type] * 4
  }
  for (const entry of json.buffers ?? []) {
    if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) throw new Error('GLTF 缓冲区长度无效。')
    bufferBytes += entry.byteLength
  }
  if (allocation > 128*1024*1024 || bufferBytes > MAX_MODEL_FILES_BYTES) throw new Error('GLTF 展开数据超过内存预算，请先简化模型。')
  // Shared meshes count once for each node/instance actually placed in the model.
  const meshTriangles = meshes.map((mesh: any) => (mesh.primitives ?? []).reduce((total: number, primitive: any) => {
    const count = accessors[primitive.indices ?? primitive.attributes?.POSITION]?.count ?? 0
    return total + ((primitive.mode ?? 4) === 4 ? Math.floor(count/3) : [5,6].includes(primitive.mode) ? Math.max(0,count-2) : 0)
  },0))
  let triangles = 0
  for (const node of nodes) {
    const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes
    const instanceAccessor = attributes ? Object.values(attributes)[0] : undefined
    const instances = instanceAccessor === undefined ? 1 : accessors[Number(instanceAccessor)]?.count ?? 0
    triangles += (meshTriangles[node.mesh] ?? 0) * instances
    if (triangles > MAX_MODEL_TRIANGLES) throw new Error('模型含实例的三角面总数不能超过 20 万。')
  }
  const seen = new Uint8Array(nodes.length)
  const visit = (id:number,depth:number) => {
    if (!Number.isInteger(id) || id<0 || id>=nodes.length || depth>128 || seen[id]===1) throw new Error('GLTF 节点层级无效或过深。')
    if (seen[id]===2) return
    seen[id]=1
    for (const child of nodes[id].children ?? []) visit(child,depth+1)
    seen[id]=2
  }
  nodes.forEach((_:unknown,id:number)=>visit(id,0))
}
export function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T> {
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException('已取消模型读取','AbortError'))
    if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true})
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))
  })
}
