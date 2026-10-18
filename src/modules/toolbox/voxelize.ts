// Backported from new_mcs (13e9642); see docs/desktop-toolbox-backport.json.
import { adjustColor, byte, createMatcher } from './color'
import { MAX_MODEL_TRIANGLES, summarizeStructure, validateVolume, type GeneratedStructure, type ModelTriangles, type Progress, type RGB, type ToolBlock, type VoxelSettings } from './types'

/** McSTools-style barycentric surface sampling, bounded and executed in a worker. */
export function voxelizeModel(model: ModelTriangles, settings: VoxelSettings, palette: readonly ToolBlock[], progress: Progress = () => {}): GeneratedStructure {
  const { positions, colors } = model
  if (!positions.length || positions.length % 9 || positions.length / 9 > MAX_MODEL_TRIANGLES || colors.length !== positions.length) throw new Error('模型三角面数量超出限制或数据不完整。')
  if (model.uvs && model.uvs.length !== positions.length / 3 * 2) throw new Error('模型纹理坐标不完整。')
  if (model.uvs?.some(n => !Number.isFinite(n)) || (model.textureIndices && model.textureIndices.length !== positions.length / 9)) throw new Error('模型纹理坐标或索引无效。')
  if ((model.textures?.length ?? 0) > 32 || model.textures?.some(texture => ![texture.width, texture.height].every(n => Number.isInteger(n) && n > 0 && n <= 1024) || texture.rgba.length !== texture.width * texture.height * 4)) throw new Error('模型纹理超过预算或数据不完整。')
  if (model.textureIndices?.some(n => n < -1 || n >= (model.textures?.length ?? 0))) throw new Error('模型纹理索引超出范围。')
  if (!['rgb','weighted','redmean','oklab'].includes(settings.match) || ![settings.brightness,settings.contrast,settings.saturation,settings.gamma].every(Number.isFinite) || settings.gamma <= 0) throw new Error('颜色设置无效。')
  if (palette.length > 4095 || new Set(palette.map(block => block.id)).size !== palette.length || palette.some(block => !/^minecraft:[a-z0-9_]+$/.test(block.id) || block.id === 'minecraft:air' || block.color.length !== 3 || block.color.some(n => !Number.isFinite(n) || n < 0 || n > 255))) throw new Error('模型方块组合无效。')
  if (!/^minecraft:[a-z0-9_]+$/.test(settings.blockId) || settings.blockId === 'minecraft:air') throw new Error('请选择非空气填充方块。')
  if (settings.fillColor && (settings.fillColor.length !== 3 || settings.fillColor.some(n => !Number.isFinite(n) || n < 0 || n > 255))) throw new Error('填充方块颜色无效。')
  if (!Number.isInteger(settings.resolution) || settings.resolution < 8 || settings.resolution > 128) throw new Error('体素分辨率必须在 8–128 之间。')
  const rotated = new Float32Array(positions.length)
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  const angles = [settings.rotateX, settings.rotateY, settings.rotateZ].map(n => n * Math.PI / 180)
  if (angles.some(n => !Number.isFinite(n))) throw new Error('模型旋转角度无效。')
  const [cx,cy,cz]=angles.map(Math.cos), [sx,sy,sz]=angles.map(Math.sin)
  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!
    if (![x, y, z].every(Number.isFinite)) throw new Error('模型包含无效坐标。')
    ;[y, z] = [y * cx - z * sx, y * sx + z * cx]
    ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
    ;[x, y] = [x * cz - y * sz, x * sz + y * cz]
    rotated.set([x, y, z], i)
    for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c]!, rotated[i + c]!); max[c] = Math.max(max[c]!, rotated[i + c]!) }
  }
  const extent = max.map((n, i) => n - min[i]!)
  const longest = Math.max(...extent)
  if (!Number.isFinite(longest) || longest < 1e-9) throw new Error('模型没有可转换的表面。')
  const scale = (settings.resolution - 1) / longest
  const size = extent.map(n => Math.max(1, Math.min(settings.resolution, Math.round(n * scale) + 1))) as [number, number, number]
  const volume = validateVolume(size)
  for (let i = 0; i < rotated.length; i++) rotated[i] = (rotated[i]! - min[i % 3]!) * scale
  const stepCounts = new Uint16Array(rotated.length / 9)
  let work = 0
  for (let t=0;t<rotated.length;t+=9) {
    const distance=(a:number,b:number)=>Math.hypot(rotated[t+a]-rotated[t+b],rotated[t+a+1]-rotated[t+b+1],rotated[t+a+2]-rotated[t+b+2])
    const steps=Math.max(1,Math.ceil(Math.max(distance(0,3),distance(3,6),distance(6,0))*2))
    work+=(steps+1)*(steps+2)/2
    if (work > 40_000_000) throw new Error('模型采样量过大，请降低分辨率或简化模型。')
    stepCounts[t/9]=steps
  }
  // Fixed-block mode has no texture/color work and needs no RGB accumulation arrays.
  const sums = settings.useColors ? [new Float32Array(volume), new Float32Array(volume), new Float32Array(volume)] : []
  const hits = new Uint32Array(volume)
  for (let t = 0; t < rotated.length; t += 9) {
    const a = [rotated[t]!, rotated[t + 1]!, rotated[t + 2]!]
    const b = [rotated[t + 3]!, rotated[t + 4]!, rotated[t + 5]!]
    const c = [rotated[t + 6]!, rotated[t + 7]!, rotated[t + 8]!]
    const steps = stepCounts[t / 9]!
    for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps - u; v++) {
      const wa = u / steps, wb = v / steps, wc = 1 - wa - wb
      const x = Math.max(0,Math.min(size[0]-1,Math.round(a[0]*wa+b[0]*wb+c[0]*wc)))
      const y = Math.max(0,Math.min(size[1]-1,Math.round(a[1]*wa+b[1]*wb+c[1]*wc)))
      const z = Math.max(0,Math.min(size[2]-1,Math.round(a[2]*wa+b[2]*wb+c[2]*wc)))
      const key = (y * size[2] + z) * size[0] + x
      hits[key]!++
      if (!settings.useColors) continue
      const texture = model.textures?.[model.textureIndices?.[t / 9] ?? -1]
      let sampled: RGB | undefined
      if (texture && model.uvs) {
        const ti = t / 3 * 2, uv = model.uvs
        const wrap = (n: number, mode: number) => mode === 1000 ? n - Math.floor(n) : mode === 1002 ? 1 - Math.abs(((n % 2 + 2) % 2) - 1) : Math.max(0, Math.min(1, n))
        const u = wrap(uv[ti]! * wa + uv[ti + 2]! * wb + uv[ti + 4]! * wc, texture.wrapS)
        const v = wrap(uv[ti + 1]! * wa + uv[ti + 3]! * wb + uv[ti + 5]! * wc, texture.wrapT)
        const ix = Math.min(texture.width - 1, Math.floor(u * texture.width))
        const iy = Math.min(texture.height - 1, Math.floor((texture.flipY ? 1 - v : v) * texture.height))
        const pixel = (iy * texture.width + ix) * 4
        sampled = [texture.rgba[pixel]!, texture.rgba[pixel + 1]!, texture.rgba[pixel + 2]!]
      }
      const linear = (n: number) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
      const srgb = (n: number) => n <= 0.0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - 0.055
      for (let ch = 0; ch < 3; ch++) {
        let color = colors[t + ch]! * wa + colors[t + 3 + ch]! * wb + colors[t + 6 + ch]! * wc
        if (sampled) color = srgb(linear(color / 255) * linear(sampled[ch]! / 255)) * 255
        sums[ch]![key]! += color
      }
    }
    if (t % 9000 === 0) progress(Math.round(t / rotated.length * 75))
  }
  const entries = [...palette].sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const match = settings.useColors ? createMatcher([...entries], settings.match) : undefined
  let fixed = entries.findIndex(block => block.id === settings.blockId)
  if (fixed < 0) {
    if (entries.length >= 4095) throw new Error('模型方块组合没有可用的填充方块位置。')
    const color: RGB = settings.fillColor ?? [125,125,125]
    entries.push({ id: settings.blockId, label: settings.blockId, group: '', color, low: color, normal: color, high: color }); fixed = entries.length - 1
  }
  const blocks = new Uint16Array(volume)
  for (let i = 0; i < volume; i++) if (hits[i]) {
    const color = sums.map(channel => byte(channel[i]! / hits[i]!)) as unknown as RGB
    blocks[i] = (match ? match(adjustColor(color, settings)) : fixed) + 1
  }
  progress(85)
  if (settings.solid && size.every(n => n > 2)) {
    // Flood the exterior. A bounding-box fill would incorrectly plug openings
    // and turn open models into solid cubes.
    const exterior = new Uint8Array(volume), queue = new Uint32Array(volume)
    let head = 0, tail = 0
    const enqueue = (index: number) => { if (!blocks[index] && !exterior[index]) { exterior[index] = 1; queue[tail++] = index } }
    const [sx, sy, sz] = size
    for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
      enqueue((y * sz + z) * sx); enqueue((y * sz + z) * sx + sx - 1)
    }
    for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) { enqueue(z * sx + x); enqueue(((sy - 1) * sz + z) * sx + x) }
    for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) { enqueue(y * sz * sx + x); enqueue((y * sz + sz - 1) * sx + x) }
    while (head < tail) {
      const index = queue[head++]!, x = index % sx, z = Math.floor(index / sx) % sz, y = Math.floor(index / (sx * sz))
      if (x > 0) enqueue(index - 1); if (x + 1 < sx) enqueue(index + 1)
      if (z > 0) enqueue(index - sx); if (z + 1 < sz) enqueue(index + sx)
      if (y > 0) enqueue(index - sx * sz); if (y + 1 < sy) enqueue(index + sx * sz)
    }
    for (let i = 0; i < volume; i++) if (!blocks[i] && !exterior[i]) blocks[i] = fixed + 1
  }
  progress(100)
  return summarizeStructure({ size, palette: ['minecraft:air', ...entries.map(block => block.id)], colors: [[0, 0, 0], ...entries.map(block => block.color)], blocks, blockCount: 0, counts: {} })
}
