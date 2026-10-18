import {validateVolume, type GeneratedStructure} from './types.ts'

// Versioned binary IPC: u32 LE JSON length, UTF-8 metadata, then dense YZX u16 LE.
// No millions-of-numbers JSON array and no repeated block IDs per voxel.
export function generatedPayload(structure: GeneratedStructure, name: string): Uint8Array {
  const volume = validateVolume(structure.size)
  if (volume !== structure.blocks.length || structure.palette[0] !== 'minecraft:air'
    || structure.palette.length > 4096) throw new Error('生成蓝图调色板或尺寸不完整。')
  const metadata = new TextEncoder().encode(JSON.stringify({protocol: 1, name: name.slice(0, 120), size: structure.size, palette: structure.palette}))
  if (metadata.length > 1024 * 1024) throw new Error('生成蓝图调色板过大。')
  const payload = new Uint8Array(4 + metadata.length + volume * 2)
  const view = new DataView(payload.buffer)
  view.setUint32(0, metadata.length, true)
  payload.set(metadata, 4)
  const offset = 4 + metadata.length
  if (new Uint8Array(Uint16Array.of(1).buffer)[0] === 1) {
    payload.set(new Uint8Array(structure.blocks.buffer, structure.blocks.byteOffset, structure.blocks.byteLength), offset)
  } else {
    for (let i = 0; i < volume; i++) view.setUint16(offset + i * 2, structure.blocks[i], true)
  }
  return payload
}
