// Backported from new_mcs (13e9642); see docs/desktop-toolbox-backport.json.
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MAX_MODEL_TRIANGLES, type ModelTriangles } from './types'
import {abortable, checkGltf, checkMeshText, checkStl, modelPath, validateModelFiles} from './model-input'

export function disposeModel(object?: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>()
  const geometries = new Set<THREE.BufferGeometry>(), skeletons = new Set<THREE.Skeleton>()
  object?.traverse(child => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return
    geometries.add(child.geometry)
    if (child instanceof THREE.SkinnedMesh) skeletons.add(child.skeleton)
    if (child instanceof THREE.InstancedMesh) child.dispose()
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  const images = new Set<ImageBitmap>()
  textures.forEach(texture => { texture.dispose(); if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image) })
  images.forEach(image => image.close())
  geometries.forEach(geometry => geometry.dispose()); skeletons.forEach(skeleton => skeleton.dispose())
  materials.forEach(material => material.dispose())
}

export async function loadLocalModel(files: File[], signal: AbortSignal): Promise<{ object: THREE.Object3D; triangles: ModelTriangles; name: string; triangleCount: number }> {
  validateModelFiles(files)
  const primary = files.filter(file => /\.(obj|stl|glb|gltf)$/i.test(file.name))
  if (primary.length !== 1) throw new Error('请选择一个模型，可同时选择 MTL、BIN 和纹理图片。')
  const file = primary[0]!
  if (file.size > 32 * 1024 * 1024) throw new Error('模型文件不能超过 32 MB。')
  signal.throwIfAborted()
  const urls = new Map<string, string>(), ownedUrls = new Set<string>()
  const manager = new THREE.LoadingManager()
  let resourceError: Error | undefined
  const resourceFailure = (message: string): never => { resourceError = new Error(message); throw resourceError }
  manager.onError = () => { resourceError = new Error('模型附件无法解码，请检查纹理和 BIN 文件。') }
  const normalize = (path: string) => modelPath(path, true)
  const paths = new Set<string>(), aliases = new Map<string, string | null>()
  for (const entry of files) {
    const path = modelPath(entry.webkitRelativePath || entry.name)
    if (paths.has(path)) throw new Error('附件文件名重复，请整理后重试。')
    paths.add(path)
    aliases.set(entry.name, aliases.has(entry.name) ? null : path)
  }
  for (const entry of files) {
    const path = modelPath(entry.webkitRelativePath || entry.name)
    const url = URL.createObjectURL(entry); ownedUrls.add(url); urls.set(path, url)
  }
  manager.setURLModifier(url => {
    try {
    if (ownedUrls.has(url)) return url
    if (/^data:(?:image\/(?:png|jpeg|webp)|application\/octet-stream|application\/gltf-buffer);base64,/i.test(url)) return url
    // GLB image bufferViews are turned into same-origin blob URLs by GLTFLoader.
    if (url.startsWith('blob:') && new URL(url).origin === window.location.origin) return url
    if (/^(?:[a-z]+:|\/\/)/i.test(url)) return resourceFailure('模型引用了外部资源，请把纹理和 BIN 文件一起选择。')
    const path=normalize(url), basename=path.split('/').pop()!, alias=aliases.get(basename)
    if(!urls.has(path) && alias===null) return resourceFailure(`模型附件名称不唯一：${basename}`)
    const local = urls.get(path) || (alias ? urls.get(alias) : undefined)
    if (!local) return resourceFailure(`缺少模型附件：${normalize(url)}`)
    return local
    } catch (error) {
      resourceError = error instanceof Error ? error : new Error(String(error))
      throw resourceError
    }
  })
  let object: THREE.Object3D | undefined
  try {
    const buffer = await abortable(file.arrayBuffer(),signal)
    signal.throwIfAborted()
    const extension = file.name.split('.').pop()!.toLowerCase()
    if (extension === 'obj') {
      const loader = new OBJLoader(manager)
      const text=new TextDecoder().decode(buffer)
      checkMeshText(text,'obj')
      const mtls = files.filter(entry => /\.mtl$/i.test(entry.name))
      if (/^\s*mtllib\s+\S/m.test(text) && !mtls.length) throw new Error('OBJ 引用了 MTL 材质，请一起选择对应文件。')
      if (mtls.length) {
        const creators = new Map<string, ReturnType<MTLLoader['parse']>>()
        for (const mtl of mtls) {
          const path = modelPath(mtl.webkitRelativePath || mtl.name), base = path.includes('/') ? path.slice(0,path.lastIndexOf('/')+1) : ''
          const creator = new MTLLoader(manager).parse(await abortable(mtl.text(),signal), base)
          for (const material of Object.keys(creator.materialsInfo)) {
            if (creators.has(material)) throw new Error(`MTL 材质名称重复：${material}`)
            creators.set(material,creator)
          }
        }
        loader.setMaterials({create(name: string) {
          const creator = creators.get(name)
          if (!creator) throw new Error(`缺少 OBJ 材质：${name}`)
          return creator.create(name)
        }})
      }
      const texturesDone = new Promise<void>((resolve, reject) => { manager.onLoad = resolve; manager.onError = () => reject(new Error('模型纹理无法读取，请检查附件。')) })
      void texturesDone.catch(()=>{})
      manager.itemStart('local-model')
      object = loader.parse(text)
      manager.itemEnd('local-model')
      await abortable(texturesDone,signal)
    } else if (extension === 'stl') {
      checkStl(buffer)
      const geometry = new STLLoader(manager).parse(buffer)
      geometry.computeVertexNormals()
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc8c8c8, vertexColors: Boolean(geometry.getAttribute('color')), roughness: 0.85 }))
    } else {
      checkGltf(buffer)
      const pending = new GLTFLoader(manager).parseAsync(buffer, '').then(gltf=>{
        if(signal.aborted){disposeModel(gltf.scene);signal.throwIfAborted()}
        return gltf
      })
      const gltf = await abortable<{scene: THREE.Object3D}>(pending,signal)
      object = gltf.scene
      // Three intentionally tolerates broken textures; a converter must not silently
      // export an untextured model when an attachment was missing or disallowed.
      if (resourceError) throw resourceError
    }
    signal.throwIfAborted()
    object.updateMatrixWorld(true)
    let triangleCount = 0
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      const attr = child.geometry.getAttribute('position')
      if (attr) triangleCount += Math.floor((child.geometry.index?.count ?? attr.count) / 3) * (child instanceof THREE.InstancedMesh ? child.count : 1)
    })
    if (!triangleCount || triangleCount > MAX_MODEL_TRIANGLES) throw new Error('模型需要包含三角面，且不能超过 20 万个三角面。')
    const positions = new Float32Array(triangleCount * 9), colors = new Uint8Array(positions.length)
    const uvs = new Float32Array(triangleCount * 6), textureIndices = new Int16Array(triangleCount).fill(-1)
    const textures: NonNullable<ModelTriangles['textures']> = [], textureCache = new Map<THREE.Texture, number>()
    let texturePixels = 0
    const textureIndex = (map: THREE.Texture | undefined) => {
      if (!map?.image) return -1
      const cached = textureCache.get(map); if (cached !== undefined) return cached
      if (textures.length >= 32) throw new Error('模型纹理过多，请合并到 32 张以内。')
      const image = map.image as CanvasImageSource & { width: number; height: number }
      if (!image.width || !image.height) return -1
      const factor = Math.min(1, 1024 / Math.max(image.width, image.height))
      const width = Math.max(1, Math.round(image.width * factor)), height = Math.max(1, Math.round(image.height * factor))
      texturePixels += width * height
      if (texturePixels > 8*1024*1024) throw new Error('采样纹理超过 32 MiB，请合并或缩小纹理。')
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const index = textures.length
      textures.push({ rgba: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, wrapS: map.wrapS, wrapT: map.wrapT, flipY: map.flipY })
      textureCache.set(map, index); canvas.width = 0; canvas.height = 0
      return index
    }
    const meshes: THREE.Mesh[] = []
    object.traverse(child => { if (child instanceof THREE.Mesh) meshes.push(child) })
    let triangle = 0
    const position = new THREE.Vector3(), color = new THREE.Color(), vertexTint = new THREE.Color(), instanceTint = new THREE.Color(), uv = new THREE.Vector2()
    const instanceMatrix = new THREE.Matrix4(), worldMatrix = new THREE.Matrix4(), fallbackColor = new THREE.Color(0xc8c8c8)
    for (const mesh of meshes) {
      const geometry = mesh.geometry, pos = geometry.getAttribute('position'), vertexColor = geometry.getAttribute('color')
      if (!pos) continue
      const index = geometry.index
      const count = index?.count ?? pos.count
      if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update()
      for (let instance = 0; instance < (mesh instanceof THREE.InstancedMesh ? mesh.count : 1); instance++) {
      worldMatrix.copy(mesh.matrixWorld); instanceTint.setRGB(1,1,1)
      if (mesh instanceof THREE.InstancedMesh) {
        mesh.getMatrixAt(instance, instanceMatrix); worldMatrix.multiply(instanceMatrix)
        if (mesh.instanceColor) mesh.getColorAt(instance, instanceTint)
      }
      for (let offset = 0; offset + 2 < count; offset += 3) {
        const materialIndex = geometry.groups.find(group => offset >= group.start && offset < group.start + group.count)?.materialIndex ?? 0
        const material = (Array.isArray(mesh.material) ? mesh.material[materialIndex] : mesh.material) as THREE.MeshStandardMaterial | undefined
        const map = material?.map ?? undefined
        const uvAttr = geometry.getAttribute(map?.channel ? `uv${map.channel}` : 'uv')
        const texIndex = uvAttr ? textureIndex(map) : -1
        textureIndices[triangle] = texIndex
        map?.updateMatrix()
        for (let corner = 0; corner < 3; corner++) {
          const vertex = index ? index.getX(offset + corner) : offset + corner
          if (!Number.isInteger(vertex) || vertex < 0 || vertex >= pos.count) throw new Error('模型三角面顶点索引无效。')
          // getVertexPosition includes the default morph/skin pose shown by Three.
          mesh.getVertexPosition(vertex, position).applyMatrix4(worldMatrix)
          if (![position.x, position.y, position.z].every(Number.isFinite)) throw new Error('模型包含无效坐标。')
          positions.set(position.toArray(), triangle * 9 + corner * 3)
          color.copy(material?.color ?? fallbackColor).multiply(instanceTint)
          if (vertexColor && material?.vertexColors) color.multiply(vertexTint.setRGB(vertexColor.getX(vertex), vertexColor.getY(vertex), vertexColor.getZ(vertex)))
          if (![color.r, color.g, color.b].every(Number.isFinite)) throw new Error('模型包含无效颜色。')
          color.convertLinearToSRGB()
          colors.set([color.r, color.g, color.b].map(n => Math.max(0, Math.min(255, Math.round(n * 255)))), triangle * 9 + corner * 3)
          if (uvAttr && map) {
            uv.set(uvAttr.getX(vertex), uvAttr.getY(vertex)).applyMatrix3(map.matrix)
            if (![uv.x,uv.y].every(Number.isFinite)) throw new Error('模型包含无效纹理坐标。')
            uvs.set(uv.toArray(), triangle * 6 + corner * 2)
          }
        }
        triangle++
        if (triangle % 4096 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); signal.throwIfAborted() }
      }
      }
    }
    return { object, triangles: { positions, colors, uvs, textureIndices, textures }, name: file.name.replace(/\.[^.]+$/, ''), triangleCount }
  } catch (error) { disposeModel(object); throw error }
  finally { ownedUrls.forEach(url => URL.revokeObjectURL(url)) }
}
