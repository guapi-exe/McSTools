import * as THREE from "three"

export type MatchMode = 'rgb' | 'weighted' | 'redmean'

export const adjustColor = (
  r: number,
  g: number,
  b: number,
  options: { brightness: number; contrast: number; saturation: number; gamma: number },
) => {
  let rf = r / 255
  let gf = g / 255
  let bf = b / 255

  const gamma = Math.max(0.01, options.gamma || 1)
  rf = Math.pow(rf, 1 / gamma)
  gf = Math.pow(gf, 1 / gamma)
  bf = Math.pow(bf, 1 / gamma)

  const saturation = Math.min(2, Math.max(0, options.saturation || 1))
  const luma = 0.2126 * rf + 0.7152 * gf + 0.0722 * bf
  rf = luma + (rf - luma) * saturation
  gf = luma + (gf - luma) * saturation
  bf = luma + (bf - luma) * saturation

  const contrast = Math.min(2, Math.max(0.2, options.contrast || 1))
  rf = Math.min(1, Math.max(0, (rf - 0.5) * contrast + 0.5))
  gf = Math.min(1, Math.max(0, (gf - 0.5) * contrast + 0.5))
  bf = Math.min(1, Math.max(0, (bf - 0.5) * contrast + 0.5))

  const brightness = Math.min(2, Math.max(0.2, options.brightness || 1))
  rf = Math.min(1, Math.max(0, rf * brightness))
  gf = Math.min(1, Math.max(0, gf * brightness))
  bf = Math.min(1, Math.max(0, bf * brightness))

  return {
    r: Math.round(rf * 255),
    g: Math.round(gf * 255),
    b: Math.round(bf * 255),
  }
}

export const colorDistance = (
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
  matchMode: MatchMode,
) => {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  if (matchMode === 'weighted') return 2 * dr * dr + 4 * dg * dg + 3 * db * db
  if (matchMode === 'redmean') {
    const rmean = (r1 + r2) / 2
    return (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db
  }
  return dr * dr + dg * dg + db * db
}

const textureImageDataCache = new WeakMap<THREE.Texture, { data: Uint8ClampedArray; width: number; height: number }>()
const uvTemp = new THREE.Vector2()

const getTextureImageData = (texture: THREE.Texture | null | undefined) => {
  if (!texture?.image) return null
  const cached = textureImageDataCache.get(texture)
  if (cached) return cached

  const image = texture.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap
  const width = (image as any).width || 0
  const height = (image as any).height || 0
  if (!width || !height) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image as any, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const result = { data: imageData.data, width, height }
  textureImageDataCache.set(texture, result)
  return result
}

export const sampleTextureColor = (texture: THREE.Texture | null | undefined, u: number, v: number) => {
  const imageData = getTextureImageData(texture)
  if (!imageData || !texture) return null

  uvTemp.set(u, v)
  texture.transformUv(uvTemp)

  const uu = Math.min(0.999999, Math.max(0, uvTemp.x))
  const vv = Math.min(0.999999, Math.max(0, 1 - uvTemp.y))

  const fx = uu * (imageData.width - 1)
  const fy = vv * (imageData.height - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(imageData.width - 1, x0 + 1)
  const y1 = Math.min(imageData.height - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0

  const idx = (x: number, y: number) => (y * imageData.width + x) * 4
  const c00 = idx(x0, y0)
  const c10 = idx(x1, y0)
  const c01 = idx(x0, y1)
  const c11 = idx(x1, y1)

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const blend = (c0: number, c1: number, c2: number, c3: number) => lerp(lerp(c0, c1, tx), lerp(c2, c3, tx), ty)

  return {
    r: Math.round(blend(imageData.data[c00], imageData.data[c10], imageData.data[c01], imageData.data[c11])),
    g: Math.round(blend(imageData.data[c00 + 1], imageData.data[c10 + 1], imageData.data[c01 + 1], imageData.data[c11 + 1])),
    b: Math.round(blend(imageData.data[c00 + 2], imageData.data[c10 + 2], imageData.data[c01 + 2], imageData.data[c11 + 2])),
  }
}

const srgbToLinear = (value: number) => {
  const v = Math.min(1, Math.max(0, value))
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

const linearToSrgb = (value: number) => {
  const v = Math.min(1, Math.max(0, value))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

export const composeDisplayColor = (
  baseColorLinear: THREE.Color,
  textureSample: { r: number; g: number; b: number } | null,
  vertexColorLinear: { r: number; g: number; b: number } | null,
) => {
  let lr = Math.min(1, Math.max(0, baseColorLinear.r))
  let lg = Math.min(1, Math.max(0, baseColorLinear.g))
  let lb = Math.min(1, Math.max(0, baseColorLinear.b))

  if (textureSample) {
    lr *= srgbToLinear(textureSample.r / 255)
    lg *= srgbToLinear(textureSample.g / 255)
    lb *= srgbToLinear(textureSample.b / 255)
  }

  if (vertexColorLinear) {
    lr *= Math.min(1, Math.max(0, vertexColorLinear.r))
    lg *= Math.min(1, Math.max(0, vertexColorLinear.g))
    lb *= Math.min(1, Math.max(0, vertexColorLinear.b))
  }

  return {
    r: Math.round(linearToSrgb(lr) * 255),
    g: Math.round(linearToSrgb(lg) * 255),
    b: Math.round(linearToSrgb(lb) * 255),
  }
}

export const countTriangles = (object: THREE.Object3D) => {
  let total = 0
  object.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry as THREE.BufferGeometry
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!positionAttr) return
    const indexAttr = geometry.getIndex()
    total += indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(positionAttr.count / 3)
  })
  return total
}

export const suggestVoxelResolution = (maxDimension: number, triangles: number) => {
  let suggested = Math.round(maxDimension * 12)
  if (triangles > 120000) suggested = Math.round(suggested * 0.75)
  if (triangles < 8000) suggested = Math.round(suggested * 1.2)
  return Math.min(224, Math.max(32, suggested || 96))
}

export const resolveTriangleMaterial = (
  mesh: THREE.Mesh,
  tri: number,
  indexAttr: THREE.BufferAttribute | null,
) => {
  const material = mesh.material
  if (!Array.isArray(material)) return material as any
  const geometry = mesh.geometry as THREE.BufferGeometry
  const groups = geometry.groups
  if (!groups || groups.length === 0) return material[0] as any

  const triStart = indexAttr ? tri * 3 : tri * 3
  for (const group of groups) {
    if (triStart >= group.start && triStart < group.start + group.count) {
      return material[group.materialIndex] as any
    }
  }
  return material[0] as any
}
