<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {invoke} from '@tauri-apps/api/core'
import {exportError as rawExportError, exportWarning, getExportFormats, type ExportFormat, type ExportOptions} from '../../modules/blueprint_export'
import {batchFilePayload, batchViewport, runBatchQueue, BATCH_FILE_LIMIT, BATCH_INPUT_LIMIT, type BatchItem, type BatchSnapshot, type BatchSaveResult} from '../../modules/toolbox/batch-queue'
import BlueprintFormatFields from '../tools/BlueprintFormatFields.vue'

const {t: $t} = useI18n()
const exportError = (reason: unknown) => rawExportError(reason, $t)

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
function status(item:BatchItem){return {queued:$t('desktop.queued'),processing:$t('desktop.processing'),success:$t('desktop.completed'),error:$t('desktop.failed')}[item.status]}
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
  try{const snapshot=await invoke<BatchSnapshot>('pick_blueprint_batch_files',{batchId:id.value});if(!disposed&&!task.signal.aborted){apply(snapshot);notice.value=$t('desktop.batchAdded')}}
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
        if(items.value.length>=BATCH_FILE_LIMIT)throw new Error($t('desktop.batchLimit'))
        const body=await batchFilePayload(id.value!,file,BATCH_INPUT_LIMIT-inputBytes.value,task.signal)
        const before=items.value.length
        const snapshot=await invoke<BatchSnapshot>('add_blueprint_batch_file',body)
        if(!disposed&&!task.signal.aborted){apply(snapshot);added+=snapshot.items.length-before}
      }catch(reason){if(!task.signal.aborted)failures.push(`${file.name}：${exportError(reason)}`)}
    }
    if(!disposed){notice.value=$t(task.signal.aborted?'desktop.batchAddedStopped':'desktop.batchAddedCount',{count:added});error.value=failures.slice(0,3).join('\n')+(failures.length>3?'\n'+$t('desktop.batchNotAdded',{count:failures.length-3}):'')}
  }finally{if(input.value)input.value.value='';await end(task)}
}
function inputChanged(event:Event){void addFiles(Array.from((event.target as HTMLInputElement).files??[]))}
function drop(event:DragEvent){dragDepth.value=0;if(!busy.value)void addFiles(Array.from(event.dataTransfer?.files??[]))}
async function run(onlyFailed=false){
  const task=begin('convert');if(!task)return
  try{
    await runBatchQueue(items.value,options.value,task.signal,(itemId,captured)=>invoke<BatchItem>('convert_blueprint_batch_item',{batchId:id.value,itemId,options:captured}),update,onlyFailed)
    if(!disposed)notice.value=task.signal.aborted?$t('desktop.batchStopped'):$t('desktop.batchComplete')
  }finally{await end(task)}
}
function stop(){
  if(!controller||controller.signal.aborted||id.value===undefined)return
  controller.abort();stopping.value=true
  stopRequest=invoke<void>('cancel_blueprint_batch',{batchId:id.value}).catch(reason=>{if(active&&!disposed)error.value=$t('desktop.stopFailed',{error:exportError(reason)})})
}
async function save(ids:number[],zip:boolean){
  const task=begin('save');if(!task)return
  try{
    const result=await invoke<BatchSaveResult>('save_blueprint_batch_results',{batchId:id.value,itemIds:[...ids],zip})
    if(!disposed)notice.value=result.canceled?$t('desktop.saveCanceled'):$t('desktop.batchSaved',{name:result.filename??'',size:bytes(result.bytes)})
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
      <div><h2 class="text-h6">{{ $t('desktop.batchTitle') }}</h2><p class="text-caption text-medium-emphasis">{{ $t('desktop.batchPrivacy') }}</p></div>
      <v-spacer/><v-chip variant="tonal">{{ $t('desktop.fileCount',{count:items.length}) }}</v-chip><v-chip color="success" variant="tonal">{{ $t('desktop.doneCount',{count:done.length}) }}</v-chip><v-chip color="error" variant="tonal">{{ $t('desktop.failedCount',{count:failed.length}) }}</v-chip>
    </div>
    <v-progress-linear v-if="mode==='initialize'" indeterminate color="primary" class="mb-4"/>
    <v-row>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-4">
          <h3 class="text-subtitle-1 mb-3">{{ $t('desktop.batchSettings') }}</h3>
          <div class="batch-drop pa-4 rounded-lg mb-4" :class="{'is-dragging':dragDepth>0}" @dragenter.prevent="!busy && dragDepth++" @dragover.prevent @dragleave.prevent="dragDepth=Math.max(0,dragDepth-1)" @drop.prevent="drop">
            <v-icon icon="mdi-file-multiple-outline" size="32" class="mb-2"/>
            <v-btn block color="primary" variant="tonal" :disabled="!ready || busy" @click="pickFiles">{{ $t('desktop.pickFiles') }}</v-btn>
            <input ref="input" class="batch-file-input" type="file" multiple accept=".litematic,.schem,.schematic,.nbt,.mcstructure,.json,.zip" :aria-label="$t('desktop.batchFiles')" :disabled="!ready || busy" @change="inputChanged"/>
            <p class="text-caption text-medium-emphasis mt-2">{{ $t('desktop.batchDropNote') }}</p>
          </div>
          <BlueprintFormatFields v-model="options" :formats="formats" :disabled="busy || !!done.length"/>
          <p class="text-caption text-medium-emphasis my-3">{{ done.length?$t('desktop.batchLocked'):$t('desktop.batchSettingsNote') }}</p>
          <div class="d-flex flex-wrap ga-2">
            <v-btn color="primary" prepend-icon="mdi-play" :disabled="!ready || busy || (!pending.length && !failed.length)" @click="run()">{{ $t('desktop.startConversion') }}</v-btn>
            <v-btn variant="tonal" prepend-icon="mdi-refresh" :disabled="busy || !failed.length" @click="run(true)">{{ $t('desktop.retryFailed') }}</v-btn>
            <v-btn v-if="busy && mode!=='initialize' && mode!=='remove'" color="warning" variant="text" :disabled="stopping" @click="stop">{{ stopping?$t('desktop.stopping'):$t('desktop.stop') }}</v-btn>
          </div>
          <p v-if="busy && mode==='convert'" class="text-caption mt-3">{{ $t('desktop.batchCancelNote') }}</p>
          <p class="text-caption text-medium-emphasis mt-3">{{ $t('desktop.batchResultLimit') }}</p>
        </v-card>
      </v-col>
      <v-col cols="12" md="8">
        <div class="d-flex flex-wrap align-center ga-2 mb-3">
          <h3 class="text-subtitle-1">{{ $t('desktop.queue') }}</h3><v-spacer/>
          <v-btn variant="text" size="small" :disabled="busy || !done.length" @click="removing=done.map(item=>item.id)">{{ $t('desktop.clearCompleted') }}</v-btn>
          <v-btn variant="text" size="small" :disabled="busy || !items.length" @click="removing=items.map(item=>item.id)">{{ $t('desktop.clearQueue') }}</v-btn>
        </div>
        <v-text-field v-if="items.length>4" v-model="query" :label="$t('desktop.findFile')" prepend-inner-icon="mdi-magnify" clearable density="compact" hide-details class="mb-3" @click:clear="query=''"/>
        <div v-if="items.length" class="mb-3">
          <p class="text-caption mb-2">{{ $t('desktop.batchProgress',{done:done.length+failed.length,count:items.length,input:bytes(inputBytes),output:bytes(outputBytes)}) }}</p>
          <v-progress-linear :model-value="progress" color="primary" rounded height="4"/>
          <v-btn-toggle v-model="filter" mandatory density="compact" color="primary" class="mt-2"><v-btn value="all">{{ $t('desktop.all') }}</v-btn><v-btn value="pending">{{ $t('desktop.pendingCount',{count:pending.length}) }}</v-btn><v-btn value="done">{{ $t('desktop.doneCount',{count:done.length}) }}</v-btn><v-btn value="failed">{{ $t('desktop.failedCount',{count:failed.length}) }}</v-btn></v-btn-toggle>
        </div>
        <div v-if="!items.length" class="batch-empty text-medium-emphasis"><v-icon icon="mdi-archive-outline" size="40"/><p>{{ $t('desktop.batchEmpty') }}</p></div>
        <div v-else-if="!filtered.length" class="batch-empty text-medium-emphasis">{{ $t('desktop.batchNoMatches') }}</div>
        <div v-else ref="list" :style="{height:viewport.height+'px'}" class="batch-list" tabindex="0" :aria-label="$t('desktop.queueList')" @scroll.passive="scrollTop=($event.target as HTMLElement).scrollTop">
          <div class="batch-window" :style="{paddingTop:viewport.paddingTop+'px',paddingBottom:viewport.paddingBottom+'px'}">
            <article v-for="item in visibleItems" :key="item.id" class="batch-item rounded-lg border pa-2" :class="`batch-item--${item.status}`" :data-status="item.status">
              <div class="batch-row-control">
                <v-checkbox-btn v-if="item.status==='success'" density="compact" :model-value="selected.has(item.id)" :aria-label="$t('desktop.selectResult',{name:item.name})" :disabled="busy" @update:model-value="toggle(item.id)"/>
                <v-progress-circular v-else-if="item.status==='processing'" indeterminate color="primary" size="22"/>
                <v-icon v-else :icon="item.status==='error'?'mdi-alert-circle-outline':'mdi-file-outline'" :color="item.status==='error'?'error':undefined"/>
              </div>
              <div class="batch-item-copy">
                <strong :title="item.name">{{ item.name }}</strong>
                <small :title="item.archiveName??item.name">{{ item.origin==='zip'?'ZIP · '+item.archiveName:$t('desktop.localFile') }} · {{ bytes(item.size) }}</small>
                <small v-if="item.outputName" :title="item.outputName">{{ item.outputName }} · {{ bytes(item.outputBytes) }}</small>
                <small v-if="item.error" class="text-error" :title="exportError(item.error)">{{ exportError(item.error) }}</small>
                <small v-if="item.warnings.length" class="text-warning">{{ $t('desktop.warningCount',{count:item.warnings.length}) }}</small>
              </div>
              <span class="text-caption">{{ status(item) }}</span>
              <div class="batch-row-actions">
                <v-btn v-if="item.status==='success' || item.error" icon="mdi-information-outline" size="x-small" variant="text" :aria-label="$t('desktop.viewDetail',{name:item.name})" @click="detail=item"/>
                <v-btn v-if="item.status==='success'" icon="mdi-content-save-outline" size="x-small" variant="text" :aria-label="$t('desktop.saveNamed',{name:item.name})" :disabled="busy" @click="save([item.id],false)"/>
                <v-btn icon="mdi-close" size="x-small" variant="text" :aria-label="$t('desktop.removeNamed',{name:item.name})" :disabled="busy" @click="removing=[item.id]"/>
              </div>
            </article>
          </div>
        </div>
        <div v-if="done.length" class="d-flex flex-wrap align-center ga-2 mt-4">
          <v-btn variant="text" size="small" :disabled="busy" @click="toggleAll">{{ selectedDone.length===done.length?$t('desktop.deselectAll'):$t('desktop.selectAllResults') }}</v-btn>
          <span class="text-caption">{{ $t('desktop.selectedCount',{count:selectedDone.length}) }}</span><v-spacer/>
          <v-btn color="primary" prepend-icon="mdi-folder-zip-outline" :disabled="busy || !selectedDone.length" @click="save(selectedDone.map(item=>item.id),true)">{{ $t('desktop.saveZip') }}</v-btn>
        </div>
        <v-alert v-if="notice" type="success" variant="tonal" density="compact" class="mt-3" role="status">{{ notice }}</v-alert>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3 batch-error" role="alert">{{ error }}<v-btn v-if="!ready" variant="text" :disabled="busy" @click="initialize">{{ $t('desktop.retryInitialize') }}</v-btn></v-alert>
      </v-col>
    </v-row>
    <v-dialog :model-value="!!detail" max-width="640" @update:model-value="value=>{if(!value)detail=undefined}"><v-card v-if="detail"><v-card-title class="batch-detail-title">{{ detail.name }}</v-card-title><v-card-text class="batch-detail-text"><p v-if="detail.status==='success'" class="mb-3">Java DataVersion: {{ detail.sourceDataVersion??$t('desktop.unknown') }} → {{ detail.outputDataVersion??$t('desktop.notApplicable') }}<br>{{ detail.outputName }} · {{ bytes(detail.outputBytes) }}</p><p v-if="detail.error">{{ exportError(detail.error) }}</p><p v-for="warning in detail.warnings" :key="warning" class="mb-3">{{ exportWarning(warning,$t) }}</p></v-card-text><v-card-actions><v-spacer/><v-btn @click="detail=undefined">{{ $t('desktop.close') }}</v-btn></v-card-actions></v-card></v-dialog>
    <v-dialog :model-value="!!removing" max-width="500" @update:model-value="value=>{if(!value)removing=undefined}"><v-card :title="$t('desktop.removeQueueTitle')"><v-card-text>{{ $t('desktop.removeQueueNote',{count:removing?.length??0}) }}</v-card-text><v-card-actions><v-spacer/><v-btn @click="removing=undefined">{{ $t('desktop.cancel') }}</v-btn><v-btn color="error" @click="remove">{{ $t('desktop.confirmRemove') }}</v-btn></v-card-actions></v-card></v-dialog>
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
