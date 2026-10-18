<script setup lang="ts">
import {computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {invoke} from '@tauri-apps/api/core'
import {exportError, getExportFormats, type ExportFormat, type ExportOptions} from '../../modules/blueprint_export'
import {batchFilePayload, batchViewport, runBatchQueue, BATCH_FILE_LIMIT, BATCH_INPUT_LIMIT, type BatchItem, type BatchSnapshot, type BatchSaveResult} from '../../modules/toolbox/batch-queue'
import BlueprintFormatFields from '../tools/BlueprintFormatFields.vue'

const id=ref<number>(),items=shallowRef<BatchItem[]>([]),formats=shallowRef<ExportFormat[]>([])
const options=ref<ExportOptions>({format:2,subtype:6,targetDataVersion:null,includeAir:false,overrides:[]})
const mode=ref(''),error=ref(''),notice=ref(''),query=ref(''),filter=ref('all'),dragDepth=ref(0)
const selected=shallowRef(new Set<number>()),detail=shallowRef<BatchItem>(),removing=ref<number[]>()
const stopping=ref(false),input=ref<HTMLInputElement>()
const list=ref<HTMLElement>(),scrollTop=ref(0)
let controller:AbortController|undefined,active=true,disposed=false
let stopRequest:Promise<void>|undefined
const busy=computed(()=>!!mode.value),ready=computed(()=>id.value!==undefined&&formats.value.length>0)
const done=computed(()=>items.value.filter(item=>item.status==='success'))
const failed=computed(()=>items.value.filter(item=>item.status==='error'))
const pending=computed(()=>items.value.filter(item=>item.status==='queued'||item.status==='processing'))
const selectedDone=computed(()=>done.value.filter(item=>selected.value.has(item.id)))
const inputBytes=computed(()=>items.value.reduce((sum,item)=>sum+item.size,0))
const outputBytes=computed(()=>done.value.reduce((sum,item)=>sum+item.outputBytes,0))
const progress=computed(()=>items.value.length?(done.value.length+failed.value.length)/items.value.length*100:0)
const filtered=computed(()=>{
  const needle=String(query.value??'').trim().toLowerCase()
  return items.value.filter(item=>(!needle||item.name.toLowerCase().includes(needle))&&(filter.value==='all'||filter.value==='done'&&item.status==='success'||filter.value==='failed'&&item.status==='error'||filter.value==='pending'&&['queued','processing'].includes(item.status)))
})
const viewport=computed(()=>batchViewport(filtered.value.length,scrollTop.value))
const visibleItems=computed(()=>filtered.value.slice(viewport.value.first,viewport.value.last))
function resetScroll(){scrollTop.value=0;if(list.value)list.value.scrollTop=0}
watch([query,filter],resetScroll)
watch(()=>filtered.value.length,count=>{if(!count)resetScroll()})
function bytes(n:number){return n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KiB`:`${(n/1024/1024).toFixed(1)} MiB`}
function status(item:BatchItem){return {queued:'待处理',processing:'转换中',success:'已完成',error:'失败'}[item.status]}
function apply(snapshot:BatchSnapshot){
  const previouslyDone=new Set(done.value.map(item=>item.id)),ids=new Set(snapshot.items.map(item=>item.id))
  const chosen=new Set([...selected.value].filter(id=>ids.has(id)))
  for(const item of snapshot.items)if(item.status==='success'&&!previouslyDone.has(item.id))chosen.add(item.id)
  id.value=snapshot.id;items.value=snapshot.items;selected.value=chosen
  if(!snapshot.items.length){query.value='';filter.value='all'}
  if(snapshot.options)options.value=snapshot.options
}
function update(item:BatchItem){
  if(disposed)return
  items.value=items.value.map(previous=>previous.id===item.id?item:previous)
  if(item.status==='success')selected.value=new Set([...selected.value,item.id])
}
async function sync(){if(id.value!==undefined&&!disposed){try{const snapshot=await invoke<BatchSnapshot>('get_blueprint_batch',{batchId:id.value});if(!disposed)apply(snapshot)}catch(reason){if(active&&!disposed)error.value=exportError(reason)}}}
async function initialize(){
  if(busy.value)return
  mode.value='initialize';error.value=''
  try{
    const catalog=await getExportFormats();if(disposed)return
    formats.value=catalog
    if(id.value!==undefined){await sync();return}
    const snapshot=await invoke<BatchSnapshot>('create_blueprint_batch')
    if(disposed){await invoke('release_blueprint_batch',{batchId:snapshot.id});return}
    apply(snapshot)
  }catch(reason){if(!disposed)error.value=exportError(reason)}finally{mode.value=''}
}
function begin(operation:string){
  if(!ready.value||busy.value||!active)return
  mode.value=operation;error.value='';notice.value='';stopping.value=false
  stopRequest=undefined;controller=new AbortController();return controller
}
async function end(task:AbortController){
  if(disposed)return
  // Do not let a delayed stop IPC cancel the next run. Navigation can call stop twice.
  await stopRequest
  if(disposed)return
  await sync()
  if(controller===task){controller=undefined;mode.value='';stopping.value=false}
}
async function pickFiles(){
  const task=begin('import');if(!task)return
  try{const snapshot=await invoke<BatchSnapshot>('pick_blueprint_batch_files',{batchId:id.value});if(!disposed&&!task.signal.aborted){apply(snapshot);notice.value='文件已加入队列，源文件未改动。'}}
  catch(reason){if(!disposed&&!task.signal.aborted)error.value=exportError(reason)}finally{await end(task)}
}
async function addFiles(files:File[]){
  if(!files.length)return
  const task=begin('import');if(!task)return
  let added=0;const failures:string[]=[]
  try{
    for(const file of files){
      if(task.signal.aborted||disposed)break
      try{
        if(items.value.length>=BATCH_FILE_LIMIT)throw new Error('队列最多 1000 个文件。')
        const body=await batchFilePayload(id.value!,file,BATCH_INPUT_LIMIT-inputBytes.value,task.signal)
        const before=items.value.length
        const snapshot=await invoke<BatchSnapshot>('add_blueprint_batch_file',body)
        if(!disposed&&!task.signal.aborted){apply(snapshot);added+=snapshot.items.length-before}
      }catch(reason){if(!task.signal.aborted)failures.push(`${file.name}：${exportError(reason)}`)}
    }
    if(!disposed){notice.value=`已加入 ${added} 个文件${task.signal.aborted?'，已停止继续读取':''}。`;error.value=failures.slice(0,3).join('\n')+(failures.length>3?`\n另有 ${failures.length-3} 个文件未加入。`:'')}
  }finally{if(input.value)input.value.value='';await end(task)}
}
function inputChanged(event:Event){void addFiles(Array.from((event.target as HTMLInputElement).files??[]))}
function drop(event:DragEvent){dragDepth.value=0;if(!busy.value)void addFiles(Array.from(event.dataTransfer?.files??[]))}
async function run(onlyFailed=false){
  const task=begin('convert');if(!task)return
  try{
    await runBatchQueue(items.value,options.value,task.signal,(itemId,captured)=>invoke<BatchItem>('convert_blueprint_batch_item',{batchId:id.value,itemId,options:captured}),update,onlyFailed)
    if(!disposed)notice.value=task.signal.aborted?'已停止队列；已完成的结果仍保留。':'队列处理完成；失败文件可单独重试。'
  }finally{await end(task)}
}
function stop(){
  if(!controller||controller.signal.aborted||id.value===undefined)return
  controller.abort();stopping.value=true
  stopRequest=invoke<void>('cancel_blueprint_batch',{batchId:id.value}).catch(reason=>{if(active&&!disposed)error.value='停止请求未送达：'+exportError(reason)})
}
async function save(ids:number[],zip:boolean){
  const task=begin('save');if(!task)return
  try{
    const result=await invoke<BatchSaveResult>('save_blueprint_batch_results',{batchId:id.value,itemIds:[...ids],zip})
    if(!disposed)notice.value=result.canceled?'已取消保存，结果仍保留。':`已保存 ${result.filename} · ${bytes(result.bytes)}`
  }catch(reason){if(!disposed&&!task.signal.aborted)error.value=exportError(reason)}finally{await end(task)}
}
async function remove(){
  const ids=removing.value;if(!ids?.length)return
  const task=begin('remove');if(!task)return
  removing.value=undefined
  try{const snapshot=await invoke<BatchSnapshot>('remove_blueprint_batch_items',{batchId:id.value,itemIds:ids});if(!disposed)apply(snapshot)}
  catch(reason){if(!disposed)error.value=exportError(reason)}finally{await end(task)}
}
function toggle(id:number){const next=new Set(selected.value);if(!next.delete(id))next.add(id);selected.value=next}
function toggleAll(){selected.value=selectedDone.value.length===done.value.length?new Set():new Set(done.value.map(item=>item.id))}
onMounted(initialize)
onActivated(()=>{active=true;void nextTick(()=>{if(list.value)list.value.scrollTop=scrollTop.value});if(id.value!==undefined&&!busy.value)void sync()})
onBeforeRouteLeave(()=>{stop()})
onDeactivated(()=>{active=false;stop();dragDepth.value=0;detail.value=undefined;removing.value=undefined})
onBeforeUnmount(()=>{disposed=true;active=false;controller?.abort();if(id.value!==undefined)void invoke('release_blueprint_batch',{batchId:id.value}).catch(()=>{})})
</script>

<template>
  <section class="batch-workbench pa-4" data-testid="batch-tool">
    <div class="batch-summary d-flex flex-wrap align-center ga-3 mb-4">
      <div><h2 class="text-h6">批量处理蓝图</h2><p class="text-caption text-medium-emphasis">只在本机处理，不上传文件、不修改源文件、不写入蓝图库。</p></div>
      <v-spacer/><v-chip variant="tonal">{{ items.length }} 个文件</v-chip><v-chip color="success" variant="tonal">{{ done.length }} 已完成</v-chip><v-chip color="error" variant="tonal">{{ failed.length }} 失败</v-chip>
    </div>
    <v-progress-linear v-if="mode==='initialize'" indeterminate color="primary" class="mb-4"/>
    <v-row>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-4">
          <h3 class="text-subtitle-1 mb-3">导入与输出设置</h3>
          <div class="batch-drop pa-4 rounded-lg mb-4" :class="{'is-dragging':dragDepth>0}" @dragenter.prevent="!busy && dragDepth++" @dragover.prevent @dragleave.prevent="dragDepth=Math.max(0,dragDepth-1)" @drop.prevent="drop">
            <v-icon icon="mdi-file-multiple-outline" size="32" class="mb-2"/>
            <v-btn block color="primary" variant="tonal" :disabled="!ready || busy" @click="pickFiles">选择文件或 ZIP</v-btn>
            <input ref="input" class="batch-file-input" type="file" multiple accept=".litematic,.schem,.schematic,.nbt,.mcstructure,.json,.zip" aria-label="批量蓝图文件" :disabled="!ready || busy" @change="inputChanged"/>
            <p class="text-caption text-medium-emphasis mt-2">也可将文件拖到这里。最多 1000 个蓝图，总输入 ≤ 256 MiB；单个 ZIP ≤ 128 MiB，解压后计入输入上限。</p>
          </div>
          <BlueprintFormatFields v-model="options" :formats="formats" :disabled="busy || !!done.length"/>
          <p class="text-caption text-medium-emphasis my-3">{{ done.length?'已有结果，清理完成项后才能更换输出设置。':'整批使用同一目标设置。保持源版本时，每份源文件分别保留其真实版本；未知版本可能需要手动指定。' }}</p>
          <div class="d-flex flex-wrap ga-2">
            <v-btn color="primary" prepend-icon="mdi-play" :disabled="!ready || busy || (!pending.length && !failed.length)" @click="run()">开始转换</v-btn>
            <v-btn variant="tonal" prepend-icon="mdi-refresh" :disabled="busy || !failed.length" @click="run(true)">重试失败</v-btn>
            <v-btn v-if="busy && mode!=='initialize' && mode!=='remove'" color="warning" variant="text" :disabled="stopping" @click="stop">{{ stopping?'正在停止…':'停止' }}</v-btn>
          </div>
          <p v-if="busy && mode==='convert'" class="text-caption mt-3">转换在原生后台串行执行。停止会阻止后续文件；当前解析／编码到安全检查点后结束，取消结果不会加入队列。</p>
          <p class="text-caption text-medium-emphasis mt-3">结果上限 512 MiB。未另存的结果只在当前软件会话中保留；返回此工具可继续，退出软件会释放。</p>
        </v-card>
      </v-col>
      <v-col cols="12" md="8">
        <div class="d-flex flex-wrap align-center ga-2 mb-3">
          <h3 class="text-subtitle-1">转换队列</h3><v-spacer/>
          <v-btn variant="text" size="small" :disabled="busy || !done.length" @click="removing=done.map(item=>item.id)">清理完成</v-btn>
          <v-btn variant="text" size="small" :disabled="busy || !items.length" @click="removing=items.map(item=>item.id)">清空队列</v-btn>
        </div>
        <v-text-field v-if="items.length>4" v-model="query" label="查找文件" prepend-inner-icon="mdi-magnify" clearable density="compact" hide-details class="mb-3" @click:clear="query=''"/>
        <div v-if="items.length" class="mb-3">
          <p class="text-caption mb-2">{{ done.length+failed.length }} / {{ items.length }} 已处理 · 输入 {{ bytes(inputBytes) }} · 结果 {{ bytes(outputBytes) }}</p>
          <v-progress-linear :model-value="progress" color="primary" rounded height="4"/>
          <v-btn-toggle v-model="filter" mandatory density="compact" color="primary" class="mt-2"><v-btn value="all">全部</v-btn><v-btn value="pending">待处理 {{ pending.length }}</v-btn><v-btn value="done">已完成 {{ done.length }}</v-btn><v-btn value="failed">失败 {{ failed.length }}</v-btn></v-btn-toggle>
        </div>
        <div v-if="!items.length" class="batch-empty text-medium-emphasis"><v-icon icon="mdi-archive-outline" size="40"/><p>先选择需要转换的蓝图文件</p></div>
        <div v-else-if="!filtered.length" class="batch-empty text-medium-emphasis">没有符合当前筛选的文件</div>
        <div v-else ref="list" :style="{height:viewport.height+'px'}" class="batch-list" tabindex="0" aria-label="转换队列列表" @scroll.passive="scrollTop=($event.target as HTMLElement).scrollTop">
          <div class="batch-window" :style="{paddingTop:viewport.paddingTop+'px',paddingBottom:viewport.paddingBottom+'px'}">
            <article v-for="item in visibleItems" :key="item.id" class="batch-item rounded-lg border pa-2" :class="`batch-item--${item.status}`" :data-status="item.status">
              <div class="batch-row-control">
                <v-checkbox-btn v-if="item.status==='success'" density="compact" :model-value="selected.has(item.id)" :aria-label="'选择结果 '+item.name" :disabled="busy" @update:model-value="toggle(item.id)"/>
                <v-progress-circular v-else-if="item.status==='processing'" indeterminate color="primary" size="22"/>
                <v-icon v-else :icon="item.status==='error'?'mdi-alert-circle-outline':'mdi-file-outline'" :color="item.status==='error'?'error':undefined"/>
              </div>
              <div class="batch-item-copy">
                <strong :title="item.name">{{ item.name }}</strong>
                <small :title="item.archiveName??item.name">{{ item.origin==='zip'?'ZIP · '+item.archiveName:'本地文件' }} · {{ bytes(item.size) }}</small>
                <small v-if="item.outputName" :title="item.outputName">{{ item.outputName }} · {{ bytes(item.outputBytes) }}</small>
                <small v-if="item.error" class="text-error" :title="exportError(item.error)">{{ exportError(item.error) }}</small>
                <small v-if="item.warnings.length" class="text-warning">{{ item.warnings.length }} 条兼容提示</small>
              </div>
              <span class="text-caption">{{ status(item) }}</span>
              <div class="batch-row-actions">
                <v-btn v-if="item.status==='success' || item.error" icon="mdi-information-outline" size="x-small" variant="text" :aria-label="'查看详情 '+item.name" @click="detail=item"/>
                <v-btn v-if="item.status==='success'" icon="mdi-content-save-outline" size="x-small" variant="text" :aria-label="'另存 '+item.name" :disabled="busy" @click="save([item.id],false)"/>
                <v-btn icon="mdi-close" size="x-small" variant="text" :aria-label="'移除 '+item.name" :disabled="busy" @click="removing=[item.id]"/>
              </div>
            </article>
          </div>
        </div>
        <div v-if="done.length" class="d-flex flex-wrap align-center ga-2 mt-4">
          <v-btn variant="text" size="small" :disabled="busy" @click="toggleAll">{{ selectedDone.length===done.length?'取消全选':'全选结果' }}</v-btn>
          <span class="text-caption">已选 {{ selectedDone.length }} 个</span><v-spacer/>
          <v-btn color="primary" prepend-icon="mdi-folder-zip-outline" :disabled="busy || !selectedDone.length" @click="save(selectedDone.map(item=>item.id),true)">打包另存 ZIP</v-btn>
        </div>
        <v-alert v-if="notice" type="success" variant="tonal" density="compact" class="mt-3" role="status">{{ notice }}</v-alert>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3 batch-error" role="alert">{{ error }}<v-btn v-if="!ready" variant="text" :disabled="busy" @click="initialize">重试初始化</v-btn></v-alert>
      </v-col>
    </v-row>
    <v-dialog :model-value="!!detail" max-width="640" @update:model-value="value=>{if(!value)detail=undefined}"><v-card v-if="detail"><v-card-title class="batch-detail-title">{{ detail.name }}</v-card-title><v-card-text class="batch-detail-text"><p v-if="detail.status==='success'" class="mb-3">Java DataVersion：{{ detail.sourceDataVersion??'未知' }} → {{ detail.outputDataVersion??'不适用' }}<br>{{ detail.outputName }} · {{ bytes(detail.outputBytes) }}</p><p v-if="detail.error">{{ exportError(detail.error) }}</p><p v-for="warning in detail.warnings" :key="warning" class="mb-3">{{ warning }}</p></v-card-text><v-card-actions><v-spacer/><v-btn @click="detail=undefined">关闭</v-btn></v-card-actions></v-card></v-dialog>
    <v-dialog :model-value="!!removing" max-width="500" @update:model-value="value=>{if(!value)removing=undefined}"><v-card title="移除队列项目？"><v-card-text>将移除 {{ removing?.length }} 个项目并释放其未另存的结果。磁盘上的源文件和已保存文件不会删除。</v-card-text><v-card-actions><v-spacer/><v-btn @click="removing=undefined">取消</v-btn><v-btn color="error" @click="remove">确认移除</v-btn></v-card-actions></v-card></v-dialog>
  </section>
</template>
<style scoped>
.batch-workbench {min-width:0;color:rgb(var(--v-theme-on-surface));}
.batch-drop {border:1px dashed rgba(var(--v-theme-on-surface),.25);text-align:center;}
.batch-drop.is-dragging {background:rgba(var(--v-theme-primary),.1);}
.batch-file-input {position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}
.batch-empty {min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;}
.batch-list {overflow:auto;overscroll-behavior:contain;}
.batch-window {display:flow-root;}
.batch-item {display:grid;grid-template-columns:32px minmax(0,1fr) auto auto;align-items:center;gap:8px;height:100px;margin-bottom:6px;}
.batch-item--processing {background:rgba(var(--v-theme-primary),.06);}
.batch-row-control {display:flex;align-items:center;justify-content:center;min-width:0;}
.batch-item-copy {min-width:0;}
.batch-item-copy strong,.batch-item-copy small {display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.batch-item-copy strong {font-size:13px;}.batch-item-copy small {font-size:11px;opacity:.8;}
.batch-row-actions {display:flex;align-items:center;gap:2px;}
.batch-error,.batch-detail-text {white-space:pre-wrap;overflow-wrap:anywhere;}
.batch-detail-title {white-space:normal;overflow-wrap:anywhere;}.batch-detail-text {max-height:60vh;overflow:auto;}
</style>
