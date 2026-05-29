import type { Vec3 } from '../types';

export const chunkKey = (pos: Vec3) => `${pos[0]},${pos[1]},${pos[2]}`;

export const parseChunkKey = (key: string): Vec3 => {
  const [x, y, z] = key.split(',').map(Number);
  return [x, y, z];
};

export const blockToChunk = (pos: Vec3, chunkSize: number): Vec3 => [
  Math.floor(pos[0] / chunkSize),
  Math.floor(pos[1] / chunkSize),
  Math.floor(pos[2] / chunkSize),
];

export const chunkBoundsCenter = (pos: Vec3, chunkSize: number): Vec3 => [
  pos[0] * chunkSize + chunkSize / 2,
  pos[1] * chunkSize + chunkSize / 2,
  pos[2] * chunkSize + chunkSize / 2,
];

export const chunkDistance = (a: Vec3, b: Vec3) => Math.max(
  Math.abs(a[0] - b[0]),
  Math.abs(a[1] - b[1]),
  Math.abs(a[2] - b[2]),
);
