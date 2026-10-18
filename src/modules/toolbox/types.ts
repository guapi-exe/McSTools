// Backported from new_mcs tool generators; desktop integration keeps the same quantized source.
export type RGB = readonly [number, number, number]
export type MatchMode = 'rgb' | 'weighted' | 'redmean' | 'oklab'
export type DitherMode = 'none' | 'floyd' | 'atkinson' | 'ordered'
export interface ToolBlock {
  id: string
  label: string
  group: string
  color: RGB
  low: RGB
  normal: RGB
  high: RGB
}
export interface ColorSettings {
  match: MatchMode
  brightness: number
  contrast: number
  saturation: number
  gamma: number
}
export const defaultColorSettings: ColorSettings = { match: 'oklab', brightness: 1, contrast: 1, saturation: 1, gamma: 1 }

/** Dense YZX order, identical to Sponge. Index 0 is always air. */
export interface GeneratedStructure {
  size: [number, number, number]
  palette: string[]
  colors: RGB[]
  blocks: Uint16Array
  blockCount: number
  counts: Record<string, number>
}
export interface MapArtSettings extends ColorSettings {
  dither: DitherMode
  adaptive: number
  relief: boolean
  maxHeight: number
  axis: 'y' | 'z' | 'x'
  alphaThreshold: number
  backing: boolean
  /**
   * Fill a column of the support block from every canvas block down to the base plane.
   *
   * For horizontal art, fill scaffolding columns to a common base plane. Backing
   * and supports use the same material. This does not simulate Minecraft physics.
   *
   * This setting is ignored unless the axis is Y and `supportBlock` is scaffolding. Other gravity
   * or attachment-sensitive blocks still need appropriate support in game.
   */
  support: boolean
  /** Block used for the backing course and the scaffolding rig. */
  supportBlock: string
}
export type ToolColorFamily =
  | 'white' | 'grey' | 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'lime'
  | 'green' | 'cyan' | 'blue' | 'purple' | 'magenta' | 'pink'
export interface MapArtInput {
  width: number
  height: number
  rgba: Uint8ClampedArray
  palette: readonly ToolBlock[]
  settings: MapArtSettings
}
export interface MapArtResult {
  /** Palette index for each visible pixel, shared by texture preview and export. */
  indices: Uint16Array
  image: Uint8ClampedArray
  width: number
  height: number
  structure: GeneratedStructure
}
export interface ModelTriangles {
  positions: Float32Array
  /** Per-vertex sRGB material × vertex colors; textures are sampled per voxel. */
  colors: Uint8Array
  uvs?: Float32Array
  textureIndices?: Int16Array
  textures?: { rgba: Uint8ClampedArray; width: number; height: number; wrapS: number; wrapT: number; flipY: boolean }[]
}
export interface VoxelSettings extends ColorSettings {
  resolution: number
  solid: boolean
  useColors: boolean
  blockId: string
  rotateX: number
  rotateY: number
  rotateZ: number
}
export type Progress = (percent: number) => void
export const MAX_GENERATOR_VOLUME = 8_000_000
export const MAX_MAP_PIXELS = 1024 * 1024
export const MAX_MODEL_TRIANGLES = 200_000

export function validateVolume(size: readonly number[]): number {
  if (size.length !== 3 || size.some(n => !Number.isInteger(n) || n < 1 || n > 32767)) throw new Error('生成尺寸无效。')
  const volume = size[0]! * size[1]! * size[2]!
  if (volume > MAX_GENERATOR_VOLUME) throw new Error('生成体积过大，请降低分辨率或阶梯高度。')
  return volume
}

export function summarizeStructure(structure: GeneratedStructure): GeneratedStructure {
  const counts: Record<string, number> = {}
  let blockCount = 0
  for (const index of structure.blocks) {
    if (!index) continue
    const id = structure.palette[index]!
    counts[id] = (counts[id] ?? 0) + 1
    blockCount++
  }
  structure.counts = counts
  structure.blockCount = blockCount
  return structure
}
