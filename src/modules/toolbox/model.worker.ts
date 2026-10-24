import {voxelizeModel} from './voxelize'
import {buildVoxelSurface} from './voxel-surface'
import type {GeneratedStructure, ModelTriangles, ToolBlock, VoxelSettings} from './types'
export type ModelWorkerRequest = {kind:'voxel';model:ModelTriangles;settings:VoxelSettings;palette:ToolBlock[]}
  | {kind:'surface';structure:GeneratedStructure}
const worker=self as unknown as {onmessage:(event:MessageEvent<ModelWorkerRequest>)=>void;postMessage:(message:unknown, transfer?:Transferable[])=>void}
worker.onmessage=({data})=>{
  try {
    if(data.kind==='voxel') {
      const result=voxelizeModel(data.model,data.settings,data.palette,progress=>worker.postMessage({progress}))
      worker.postMessage({result},[result.blocks.buffer])
    } else {
      const result=buildVoxelSurface(data.structure)
      worker.postMessage({result},[result.positions.buffer,result.normals.buffer,result.colors.buffer])
    }
  } catch(error) {worker.postMessage({error:String(error)})}
}
