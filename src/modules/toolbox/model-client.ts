import type {ModelWorkerRequest} from './model.worker'
import type {GeneratedStructure, ModelTriangles, ToolBlock, VoxelSettings} from './types'
import type {VoxelSurface} from './voxel-surface'

function run<T>(input:ModelWorkerRequest,signal:AbortSignal,progress:(value:number)=>void=()=>{}):Promise<T> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('已取消模型任务','AbortError'));return}
    const worker=new Worker(new URL('./model.worker.ts',import.meta.url),{type:'module'})
    const finish=()=>{worker.terminate();signal.removeEventListener('abort',abort)}
    const abort=()=>{finish();reject(new DOMException('已取消模型任务','AbortError'))}
    signal.addEventListener('abort',abort,{once:true})
    worker.onerror=event=>{finish();reject(new Error(event.message||'模型任务失败'))}
    worker.onmessageerror=()=>{finish();reject(new Error('模型任务结果无法读取'))}
    worker.onmessage=({data})=>{
      if('progress' in data){progress(data.progress);return}
      finish();if(data.error)reject(new Error(data.error));else resolve(data.result)
    }
    // Keep the source buffers intact for retries/rotation changes and cached-page return.
    try{worker.postMessage(input)}catch(error){finish();reject(error)}
  })
}
export const runVoxelModel=(model:ModelTriangles,settings:VoxelSettings,palette:ToolBlock[],signal:AbortSignal,progress:(n:number)=>void)=>
  run<GeneratedStructure>({kind:'voxel',model,settings,palette},signal,progress)
export const runVoxelSurface=(structure:GeneratedStructure,signal:AbortSignal)=>run<VoxelSurface>({kind:'surface',structure},signal)
