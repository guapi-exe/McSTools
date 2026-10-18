// Backported from new_mcs tool generators; desktop integration keeps the same quantized source.
import type { ColorSettings, MatchMode, RGB } from './types'

// Ported from McSTools image_rebuild.ts / modules/map_art.rs. Adjust exactly
// once before diffusion; the same quantized result feeds preview and export.
export const byte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))
export function adjustColor(rgb: RGB, options: ColorSettings): RGB {
  let channels = rgb.map(n => Math.pow(n / 255, 1 / Math.max(0.1, options.gamma)))
  const luma = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
  channels = channels.map(n => {
    const saturated = luma + (n - luma) * options.saturation
    const contrasted = Math.max(0, Math.min(1, (saturated - 0.5) * options.contrast + 0.5))
    return byte(contrasted * options.brightness * 255)
  })
  return channels as unknown as RGB
}
export function toOklab(rgb: RGB): RGB {
  const [r, g, b] = rgb.map(n => n / 255 <= 0.04045 ? n / 255 / 12.92 : ((n / 255 + 0.055) / 1.055) ** 2.4) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
export function colorDistance(a: RGB, b: RGB, mode: MatchMode): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  if (mode === 'weighted') return 2 * dr * dr + 4 * dg * dg + 3 * db * db
  if (mode === 'redmean') {
    const mean = (a[0] + b[0]) / 2
    return (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db
  }
  return dr * dr + dg * dg + db * db
}
export function createMatcher<T extends { color: RGB }>(entries: readonly T[], mode: MatchMode) {
  if (!entries.length) throw new Error('请至少选择一种方块。')
  const measured = mode === 'oklab' ? entries.map(entry => toOklab(entry.color)) : entries.map(entry => entry.color)
  const cache = new Map<number, number>()
  return (rgb: RGB, permitted?: (entry: T) => boolean): number => {
    const key = byte(rgb[0]) * 65536 + byte(rgb[1]) * 256 + byte(rgb[2])
    const cached = !permitted ? cache.get(key) : undefined
    if (cached !== undefined) return cached
    const target = mode === 'oklab' ? toOklab(rgb) : rgb
    let best = -1, distance = Infinity
    for (let i = 0; i < entries.length; i++) {
      if (permitted && !permitted(entries[i]!)) continue
      const next = colorDistance(target, measured[i]!, mode)
      if (next < distance - 1e-12) { best = i; distance = next }
    }
    if (best < 0) throw new Error('当前设置没有可用方块。')
    if (!permitted && cache.size < 65536) cache.set(key, best)
    return best
  }
}
