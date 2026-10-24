// Browser fixtures: real Three loaders and local Blob resources, no native/database writes.
export const cubeObj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 4 3 7 8\nf 1 4 8 5\nf 2 6 7 3\n';
export async function modelLoaderChecks() {
  const {loadLocalModel,disposeModel}=await import('/src/modules/toolbox/model-loader.ts');
  const file=(name,data)=>new File([data],name), signal=()=>new AbortController().signal;
  const results=[];
  const assert=(condition,message)=>{if(!condition)throw new Error(message);};
  const check=async (name,files,verify)=>{
    const loaded=await loadLocalModel(files,signal());
    try{verify(loaded);results.push(name);}finally{disposeModel(loaded.object);}
  };
  await check('OBJ quads',[file('cube.obj',cubeObj)],m=>assert(m.triangleCount===12,'OBJ triangle count'));
  const stl='solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle';
  await check('ASCII STL',[file('triangle.stl',stl)],m=>assert(m.triangleCount===1,'STL triangles'));
  const binary=new ArrayBuffer(134), binaryView=new DataView(binary);
  binaryView.setUint32(80,1,true);
  [0,0,1,0,0,0,1,0,0,0,1,0].forEach((n,i)=>binaryView.setFloat32(84+i*4,n,true));
  await check('binary STL',[file('triangle.stl',binary)],m=>assert(m.triangles.positions[3]===1,'binary STL coordinate'));
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,2,2);
  const png=await new Promise(resolve=>canvas.toBlob(resolve));canvas.width=canvas.height=0;
  const obj='mtllib material.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 0\nvt 0.25 0.25\nusemtl red\nf 1/1 2/1 3/1\nusemtl blue\nf 2/1 4/1 3/1';
  const mtl='newmtl red\nKd 1 0 0\nmap_Kd texture.png\nnewmtl blue\nKd 0 0 1\nmap_Kd texture.png';
  await check('OBJ + MTL + texture material groups',[file('model.obj',obj),file('material.mtl',mtl),file('texture.png',png)],m=>{
    assert(m.triangleCount===2 && m.triangles.textures.length>0,'OBJ texture extraction');
    assert(m.triangles.colors[0]===255 && m.triangles.colors[2]===0 && m.triangles.colors[9]===0 && m.triangles.colors[11]===255,'OBJ grouped material colors');
  });
  const raw=Float32Array.from([0,0,0,1,0,0,0,1,0,.25,.25,.25,.25,.25,.25,0,0,0,2,0,0]);
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,translation:[3,0,0]}],
    buffers:[{uri:'mesh.bin',byteLength:raw.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:24},{buffer:0,byteOffset:60,byteLength:24}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC2'},{bufferView:2,componentType:5126,count:2,type:'VEC3'}],
    images:[{uri:'texture.png'}],textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorFactor:[0,1,0,1],baseColorTexture:{index:0,texCoord:1}}}],
    meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_1:1},material:0}]}]};
  await check('GLTF + BIN + PNG and UV channel 1',[file('model.gltf',JSON.stringify(json)),file('mesh.bin',raw),file('texture.png',png)],m=>{
    assert(m.triangleCount===1 && m.triangles.positions[0]===3,'GLTF transformed coordinate');
    assert(m.triangles.textureIndices[0]===0 && m.triangles.uvs[0]===.25,'GLTF UV channel');
    assert(m.triangles.colors[0]===0 && m.triangles.colors[1]===255,'GLTF material color');
  });
  const instanced=structuredClone(json);instanced.extensionsUsed=['EXT_mesh_gpu_instancing'];instanced.nodes[0].extensions={EXT_mesh_gpu_instancing:{attributes:{TRANSLATION:2}}};
  await check('GLTF instanced transforms',[file('instances.gltf',JSON.stringify(instanced)),file('mesh.bin',raw),file('texture.png',png)],m=>{
    assert(m.triangleCount===2 && m.triangles.positions[0]===3 && m.triangles.positions[9]===5,'GLTF instance extraction');
  });
  const skinnedBytes=new ArrayBuffer(208);
  new Float32Array(skinnedBytes,0,9).set([0,0,0,1,0,0,0,1,0]);
  new Float32Array(skinnedBytes,36,9).set([0,0,2,0,0,2,0,0,2]);
  new Float32Array(skinnedBytes,72,12).set([1,0,0,0,1,0,0,0,1,0,0,0]);
  new Float32Array(skinnedBytes,120,16).set([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const skinned={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{mesh:0,skin:0,weights:[.5]},{translation:[0,2,0]}],skins:[{joints:[1],inverseBindMatrices:3}],
    buffers:[{uri:'pose.bin',byteLength:208}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:48},{buffer:0,byteOffset:120,byteLength:64},{buffer:0,byteOffset:184,byteLength:24}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3',min:[0,0,2],max:[0,0,2]},{bufferView:2,componentType:5126,count:3,type:'VEC4'},{bufferView:3,componentType:5126,count:1,type:'MAT4'},{bufferView:4,componentType:5123,count:3,type:'VEC4'}],
    meshes:[{weights:[.5],primitives:[{attributes:{POSITION:0,WEIGHTS_0:2,JOINTS_0:4},targets:[{POSITION:1}]}]}]};
  await check('GLTF default skin and morph pose',[file('pose.gltf',JSON.stringify(skinned)),file('pose.bin',skinnedBytes)],m=>{
    assert(JSON.stringify([...m.triangles.positions])===JSON.stringify([0,2,1,1,2,1,0,3,1]),'default skin/morph position');
  });
  const embedded=structuredClone(json);delete embedded.buffers[0].uri;delete embedded.images;delete embedded.textures;delete embedded.materials;delete embedded.meshes[0].primitives[0].material;
  const text=new TextEncoder().encode(JSON.stringify(embedded)), jsonLength=Math.ceil(text.length/4)*4, glb=new ArrayBuffer(12+8+jsonLength+8+raw.byteLength), view=new DataView(glb);
  [0x46546c67,2,glb.byteLength,jsonLength,0x4e4f534a].forEach((n,i)=>view.setUint32(i*4,n,true));
  new Uint8Array(glb,20,jsonLength).fill(32);new Uint8Array(glb,20,text.length).set(text);
  view.setUint32(20+jsonLength,raw.byteLength,true);view.setUint32(24+jsonLength,0x004e4942,true);new Uint8Array(glb,28+jsonLength).set(new Uint8Array(raw.buffer));
  await check('GLB binary container',[file('model.glb',glb)],m=>assert(m.triangleCount===1,'GLB triangle count'));
  for (const [name,files,pattern] of [
    ['missing GLTF attachment',[file('missing.gltf',JSON.stringify(json))],/缺少模型附件/],
    ['missing GLTF texture cannot silently export',[file('missing-texture.gltf',JSON.stringify(json)),file('mesh.bin',raw)],/缺少模型附件/],
    ['broken GLTF texture cannot silently export',[file('broken-texture.gltf',JSON.stringify(json)),file('mesh.bin',raw),file('texture.png','not an image')],/模型附件无法解码/],
    ['external resource rejected',[file('external.gltf',JSON.stringify({...json,buffers:[{uri:'https://example.invalid/mesh.bin',byteLength:raw.byteLength}]}))],/外部资源/],
    ['duplicate names',[file('model.obj',cubeObj),file('same.png',png),file('same.png',png)],/附件文件名重复/],
  ]) {
    let rejected=false;
    try{const m=await loadLocalModel(files,signal());disposeModel(m.object);}catch(error){rejected=pattern.test(String(error));}
    assert(rejected,name);results.push(name);
  }
  return results;
}
