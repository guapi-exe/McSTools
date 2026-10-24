import {validateVolume, type GeneratedStructure} from './types'

export const MAX_PREVIEW_FACES = 240_000
const sides = [
  {step:[-1,0,0],corners:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]},
  {step:[1,0,0],corners:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},
  {step:[0,-1,0],corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
  {step:[0,1,0],corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},
  {step:[0,0,-1],corners:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]},
  {step:[0,0,1],corners:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]},
]
export interface VoxelSurface {positions: Float32Array; normals: Float32Array; colors: Float32Array; faces: number}

/** Only exposed faces, built off the main thread. Preview limits never truncate exports. */
export function buildVoxelSurface(structure: GeneratedStructure, maxFaces = MAX_PREVIEW_FACES): VoxelSurface {
  const volume = validateVolume(structure.size), [sx, sy, sz] = structure.size, {blocks} = structure
  if (blocks.length !== volume || blocks.some(index => index >= structure.colors.length)) throw new Error('方块预览数据不完整。')
  const exposed = (x: number, y: number, z: number, step: number[]) => {
    const nx=x+step[0], ny=y+step[1], nz=z+step[2]
    return nx<0 || nx>=sx || ny<0 || ny>=sy || nz<0 || nz>=sz || !blocks[(ny*sz+nz)*sx+nx]
  }
  let faces=0
  for(let y=0;y<sy;y++) for(let z=0;z<sz;z++) for(let x=0;x<sx;x++) {
    if (!blocks[(y*sz+z)*sx+x]) continue
    for (const side of sides) if (exposed(x,y,z,side.step)) {
      if (++faces > maxFaces) throw new Error('方块预览表面过于复杂；完整生成结果仍可导出，请降低分辨率后预览。')
    }
  }
  const positions=new Float32Array(faces*18), normals=new Float32Array(faces*18), colors=new Float32Array(faces*18)
  const palette=structure.colors.map(rgb=>rgb.map(n=>n/255<=.04045?n/255/12.92:((n/255+.055)/1.055)**2.4))
  let cursor=0
  for(let y=0;y<sy;y++) for(let z=0;z<sz;z++) for(let x=0;x<sx;x++) {
    const id=blocks[(y*sz+z)*sx+x]
    if(!id) continue
    for(const side of sides) if(exposed(x,y,z,side.step)) for(const index of [0,1,2,0,2,3]) {
      const corner=side.corners[index]
      positions.set([x+corner[0],y+corner[1],z+corner[2]],cursor)
      normals.set(side.step,cursor); colors.set(palette[id],cursor); cursor+=3
    }
  }
  return {positions,normals,colors,faces}
}
