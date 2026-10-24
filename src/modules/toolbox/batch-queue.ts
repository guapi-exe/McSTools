import type {ExportOptions} from '../blueprint_export'
export const BATCH_FILE_LIMIT=1000, BATCH_INPUT_LIMIT=256*1024*1024, BATCH_ARCHIVE_LIMIT=128*1024*1024
export interface BatchItem {
  id:number;name:string;origin:'file'|'zip';archiveName:string|null;size:number
  status:'queued'|'processing'|'success'|'error';error:string|null;outputName:string|null;outputBytes:number
  sourceDataVersion:number|null;outputDataVersion:number|null;warnings:string[]
}
export interface BatchSnapshot {id:number;items:BatchItem[];inputBytes:number;outputBytes:number;busy:'import'|'convert'|'save'|null;stopping:boolean;options:ExportOptions|null}
export interface BatchSaveResult {canceled:boolean;filename:string|null;bytes:number}
/** Fixed row geometry does not learn a zero height while KeepAlive/VWindow is hidden. */
export function batchViewport(count:number,scrollTop:number){
  const rowHeight=106,height=Math.min(530,count*rowHeight)
  const offset=Math.min(Math.max(0,Number.isFinite(scrollTop)?scrollTop:0),Math.max(0,count*rowHeight-height))
  const first=Math.max(0,Math.floor(offset/rowHeight)-2),last=Math.min(count,first+Math.ceil(height/rowHeight)+4)
  return {height,first,last,paddingTop:first*rowHeight,paddingBottom:(count-last)*rowHeight}
}
export function batchFileAllowed(name:string){return /\.(?:litematic|schem|schematic|nbt|mcstructure|json|zip)$/i.test(name)}
export function validateBatchFile(file:{name:string;size:number},remainingBytes=BATCH_INPUT_LIMIT){
  if(!batchFileAllowed(file.name))throw new Error('不支持的文件类型：'+file.name)
  const limit=/\.zip$/i.test(file.name)?BATCH_ARCHIVE_LIMIT:Math.min(remainingBytes,BATCH_INPUT_LIMIT)
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>limit)throw new Error(/\.zip$/i.test(file.name)?'ZIP 文件超过 128 MiB。':'待处理文件总大小不能超过 256 MiB。')
}
export async function batchFilePayload(batchId:number,file:File,remainingBytes:number,signal:AbortSignal){
  validateBatchFile(file,remainingBytes);signal.throwIfAborted()
  const meta=new TextEncoder().encode(JSON.stringify({protocol:1,batch_id:batchId,name:file.name}))
  if(meta.length>4096||new TextEncoder().encode(file.name).length>1024)throw new Error('文件名过长。')
  const source=new Uint8Array(await file.arrayBuffer());signal.throwIfAborted()
  if(source.length!==file.size)throw new Error('读取文件大小不一致，请重新选择。')
  const body=new Uint8Array(4+meta.length+source.length);new DataView(body.buffer).setUint32(0,meta.length,true)
  body.set(meta,4);body.set(source,4+meta.length);return body
}
/** Serial processing, immutable options, per-file failure isolation, no late UI publication. */
export async function runBatchQueue(items:readonly BatchItem[],options:ExportOptions,signal:AbortSignal,
  convert:(id:number,options:ExportOptions)=>Promise<BatchItem>,update:(item:BatchItem)=>void,onlyFailed=false){
  const pending=items.filter(item=>onlyFailed?item.status==='error':item.status==='queued'||item.status==='error').map(item=>({...item}))
  const captured:ExportOptions=JSON.parse(JSON.stringify(options))
  for(const item of pending){
    if(signal.aborted)break
    update({...item,status:'processing',error:null})
    try{const result=await convert(item.id,JSON.parse(JSON.stringify(captured)));if(!signal.aborted)update(result)}
    catch(reason){if(!signal.aborted)update({...item,status:'error',error:String(reason)})}
  }
}
