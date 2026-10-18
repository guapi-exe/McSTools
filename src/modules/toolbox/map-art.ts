// Backported from new_mcs tool generators; desktop integration keeps the same quantized source.
// Explicit extensions so this module also loads under plain Node for its unit test, not
// only through the bundler.
import { adjustColor, byte, createMatcher } from './color.ts'
import { MAX_MAP_PIXELS, summarizeStructure, validateVolume, type MapArtInput, type MapArtResult, type Progress, type RGB } from './types.ts'

export function fitAspect(width: number, height: number, value: number, axis: 'width' | 'height', limit = 2048): { width: number; height: number } {
  if (![width, height, value].every(n => Number.isFinite(n) && n > 0)) throw new Error('图片尺寸无效。')
  const ratio = width / height
  let w = axis === 'width' ? value : value * ratio
  let h = axis === 'height' ? value : value / ratio
  const scale = Math.min(1, limit / w, limit / h, Math.sqrt(MAX_MAP_PIXELS / (w * h)))
  w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale))
  if (w * h > MAX_MAP_PIXELS) h = Math.max(1, Math.floor(MAX_MAP_PIXELS / w))
  return { width: w, height: h }
}

export function generateMapArt(input: MapArtInput, progress: Progress = () => {}): MapArtResult {
  const { width, height, rgba, settings: s } = input
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 2048) || width * height > MAX_MAP_PIXELS || rgba.length !== width * height * 4) throw new Error('图片尺寸过大或像素数据不完整。')
  if (!Number.isInteger(s.maxHeight) || s.maxHeight < 1 || s.maxHeight > 256) throw new Error('阶梯高度必须在 1–256 之间。')
  if (!['x', 'y', 'z'].includes(s.axis) || !['none', 'floyd', 'atkinson', 'ordered'].includes(s.dither)
    || !['rgb', 'weighted', 'redmean', 'oklab'].includes(s.match)
    || ![s.brightness, s.contrast, s.saturation, s.gamma, s.adaptive, s.alphaThreshold].every(Number.isFinite)
    || s.gamma <= 0 || s.adaptive < 0 || s.adaptive > 1 || s.alphaThreshold < 0 || s.alphaThreshold > 255) throw new Error('生成设置无效。')
  if (!input.palette.length || input.palette.length > 4096 || new Set(input.palette.map(block => block.id)).size !== input.palette.length
    || input.palette.some(block => block.id === 'minecraft:air' || [block.color, block.low, block.normal, block.high].some(rgb => rgb.length !== 3 || rgb.some(n => !Number.isFinite(n) || n < 0 || n > 255)))) throw new Error('请选择有效且不重复的非空气方块。')
  const palette = [...input.palette].sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const candidates = palette.flatMap((block, index) => s.relief
    ? [{ color: block.normal, step: 0, index: index + 1 }, { color: block.high, step: 1, index: index + 1 }, { color: block.low, step: -1, index: index + 1 }]
    : [{ color: block.color, step: 0, index: index + 1 }])
  // Central shade first gives deterministic, flat tie-breaking.
  candidates.sort((a, b) => Math.abs(a.step) - Math.abs(b.step) || a.index - b.index)
  const match = createMatcher(candidates, s.match)
  const adjusted = new Float32Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const color = adjustColor([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!], s)
    adjusted.set(color, i); adjusted[i + 3] = rgba[i + 3]!
  }
  const source = adjusted.slice()
  const image = new Uint8ClampedArray(rgba.length)
  const indices = new Uint16Array(width * height)
  const elevations = new Uint16Array(width * height)
  const columns = new Int16Array(width).fill(Math.floor((s.maxHeight - 1) / 2))
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  let min = Infinity, max = -Infinity
  for (let y = 0; y < height; y++) {
    const direction = y % 2 ? -1 : 1
    for (let col = 0; col < width; col++) {
      const x = direction === 1 ? col : width - col - 1
      const p = y * width + x, i = p * 4
      if (rgba[i + 3]! <= s.alphaThreshold) continue
      let edge = 0, neighbors = 0
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx! < 0 || nx! >= width || ny! < 0 || ny! >= height) continue
        const ni = (ny! * width + nx!) * 4
        for (let c = 0; c < 3; c++) edge += Math.abs(source[i + c]! - source[ni + c]!)
        neighbors++
      }
      edge = Math.min(1, neighbors ? edge / (neighbors * 255 * 3) * 2 : 1)
      const threshold = s.dither === 'ordered' ? (bayer[(y % 4) * 4 + x % 4]! / 16 - 0.5) * 24 * (1 - s.adaptive * (1 - edge)) : 0
      const rgb: RGB = [byte(adjusted[i]! + threshold), byte(adjusted[i + 1]! + threshold), byte(adjusted[i + 2]! + threshold)]
      const previous = columns[x]!
      const candidate = candidates[match(rgb, s.relief ? entry => previous + entry.step >= 0 && previous + entry.step < s.maxHeight : undefined)]!
      const level = s.relief ? previous + candidate.step : 0
      columns[x] = level; elevations[p] = level; indices[p] = candidate.index
      min = Math.min(min, level); max = Math.max(max, level)
      image.set([...candidate.color, 255], i)
      if (s.dither === 'floyd' || s.dither === 'atkinson') {
        const diffusion = s.dither === 'atkinson'
          ? [[direction, 0, 1 / 8], [direction * 2, 0, 1 / 8], [-direction, 1, 1 / 8], [0, 1, 1 / 8], [direction, 1, 1 / 8], [0, 2, 1 / 8]]
          : [[direction, 0, 7 / 16], [-direction, 1, 3 / 16], [0, 1, 5 / 16], [direction, 1, 1 / 16]]
        for (const [dx, dy, weight] of diffusion) {
          const nx = x + dx!, ny = y + dy!
          // Never wrap diffusion across a row or into a transparent pixel.
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const ni = (ny * width + nx) * 4
          if (rgba[ni + 3]! <= s.alphaThreshold) continue
          for (let c = 0; c < 3; c++) adjusted[ni + c]! += (rgb[c]! - candidate.color[c]!) * weight! * Math.max(0.2, 1 - s.adaptive * (1 - edge) * 0.8)
        }
      }
    }
    if (y % 8 === 0) progress(Math.round((y + 1) / height * 85))
  }
  if (!Number.isFinite(min)) throw new Error('图片完全透明，没有可以生成的方块。')
  // The website's support rig is specific to scaffolding. Other fragile/gravity
  // blocks still need placement checks in game; this is not a physics simulator.
  const wantsSupports = s.support && s.axis === 'y' && s.supportBlock === 'minecraft:scaffolding'
  const span = max - min
  // Supports occupy the existing relief span, not another empty span above it.
  const depth = span + 1 + (s.backing ? 1 : 0)
  const size: [number, number, number] = s.axis === 'x' ? [depth, height, width] : s.axis === 'z' ? [width, height, depth] : [width, depth, height]
  const blocks = new Uint16Array(validateVolume(size))
  const ids = ['minecraft:air', ...palette.map(block => block.id)]
  const colors: RGB[] = [[0, 0, 0], ...palette.map(block => block.color)]
  // The backing course and the supports share one block, so the whole rig has a single
  // material to break when the art comes down.
  const supportBlock = s.supportBlock && s.supportBlock !== 'minecraft:air' ? s.supportBlock : 'minecraft:stone'
  let backing = ids.indexOf(supportBlock)
  if (backing < 0) { ids.push(supportBlock); colors.push([125, 125, 125]); backing = ids.length - 1 }
  const put = (x: number, y: number, depth: number, index: number) => {
    const position = s.axis === 'x' ? [depth, height - y - 1, x] : s.axis === 'z' ? [x, height - y - 1, depth] : [x, depth, y]
    blocks[(position[1]! * size[2] + position[2]!) * size[0] + position[0]!] = index
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x
    if (!indices[p]) continue
    const level = elevations[p]! - min + (s.backing ? 1 : 0)
    put(x, y, level, indices[p]!)
    if (s.backing) put(x, y, level - 1, backing)
    // Scaffolding is the one palette block that cannot float: it breaks when the block
    // below it goes. Filling the column down to the base keeps the whole canvas standing
    // and leaves one course to break at the bottom when the art comes down.
    if (!wantsSupports) continue
    // Include y=0 even with backing: leaving a gap under elevated backing cells
    // would make the supposedly supported scaffolding column float.
    for (let below = level - 1; below >= 0; below -= 1) put(x, y, below, backing)
  }
  progress(100)
  return { image, indices, width, height, structure: summarizeStructure({ size, palette: ids, colors, blocks, blockCount: 0, counts: {} }) }
}
