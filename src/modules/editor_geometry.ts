import type {EditRegion, EditorPoint, WorkPlane} from './blueprint_editor'
import type {RayData} from './3DBLOCKS/runtime/InteractiveCanvas'
export interface RegionFace { axis: 0 | 1 | 2; edge: 'min' | 'max'; center: EditorPoint }
export function validRegion(region: EditRegion, dimensions: EditorPoint): boolean {
  return dimensions.every((length, axis) => Number.isInteger(length) && length > 0
    && Number.isInteger(region.min[axis]) && Number.isInteger(region.max[axis])
    && region.min[axis] >= 0 && region.max[axis] >= region.min[axis] && region.max[axis] < length)
}
export function pickWorkPlane(ray: RayData, plane: WorkPlane, dimensions: EditorPoint): EditorPoint | null {
  const d = ray.rayDir[plane.axis]
  if (!Number.isFinite(plane.coordinate) || Math.abs(d) < 1e-8) return null
  const t = (plane.coordinate + .5 - ray.rayOrigin[plane.axis]) / d
  if (t < 0 || !Number.isFinite(t)) return null
  const pos = ray.rayOrigin.map((origin, axis) => Math.floor(origin + t * ray.rayDir[axis])) as EditorPoint
  pos[plane.axis] = plane.coordinate
  return pos.every((n, axis) => Number.isInteger(n) && n >= 0 && n < dimensions[axis]) ? pos : null
}
export function hitRegionFace(ray: RayData, region: EditRegion): RegionFace | null {
  let closest = Infinity
  let hit: RegionFace | null = null
  for (const axis of [0, 1, 2] as const) {
    if (Math.abs(ray.rayDir[axis]) < 1e-8) continue
    for (const edge of ['min', 'max'] as const) {
      const coordinate = region[edge][axis] + (edge === 'max' ? 1 : 0)
      const t = (coordinate - ray.rayOrigin[axis]) / ray.rayDir[axis]
      if (t < 0 || t >= closest) continue
      const pos = ray.rayOrigin.map((n, a) => n + ray.rayDir[a] * t)
      if (!pos.every((n, a) => a === axis || (n >= region.min[a] - 1e-6 && n <= region.max[a] + 1 + 1e-6))) continue
      const center = region.min.map((n, a) => (n + region.max[a] + 1) / 2) as EditorPoint
      center[axis] = coordinate
      closest = t; hit = {axis, edge, center}
    }
  }
  return hit
}
// Closest point along the face's movement axis, independent of perspective,
// zoom and the direction in which the camera is facing. Parallel views cannot
// unambiguously drag that axis and are deliberately left unchanged.
export function rayAxisParameter(ray: RayData, origin: EditorPoint, axis: number): number | null {
  const length = Math.hypot(...ray.rayDir)
  if (length < 1e-8) return null
  const d = ray.rayDir.map(n => n / length)
  const denominator = 1 - d[axis] ** 2
  if (denominator < 1e-5) return null
  const q = origin.map((n, a) => n - ray.rayOrigin[a])
  const dot = q.reduce((total, n, a) => total + n * d[a], 0)
  return (d[axis] * dot - q[axis]) / denominator
}
export function moveRegionFace(region: EditRegion, face: RegionFace, delta: number, dimensions: EditorPoint): EditRegion {
  const next: EditRegion = {min: [...region.min], max: [...region.max]}
  if (!Number.isFinite(delta)) return next
  const low = face.edge === 'max' ? region.min[face.axis] : 0
  const high = face.edge === 'min' ? region.max[face.axis] : dimensions[face.axis] - 1
  next[face.edge][face.axis] = Math.max(low, Math.min(high, region[face.edge][face.axis] + Math.round(delta)))
  return next
}
