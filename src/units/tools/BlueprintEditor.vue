<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, onDeactivated, ref, shallowRef, watch} from 'vue'
import type {SchematicPreviewData} from '../../modules/schematic_data'
import {cancelEdit, closeEditor, commitEdit, openEditor, stageEdit,
  type EditRegion, type EditorAction, type EditorInfo, type EditorPoint, type PickMode, type WorkPlane} from '../../modules/blueprint_editor'
import {validRegion} from '../../modules/editor_geometry'
import {fetchJeBlocks, jeBlocks} from '../../modules/je_blocks'
import type {ExportSource} from '../../modules/blueprint_export'

const BlueprintExportPanel = defineAsyncComponent(() => import('./BlueprintExportPanel.vue'))

const props = defineProps<{sourceId: number; applyPreview: (preview: SchematicPreviewData) => Promise<void>; inactive?: boolean}>()
const emit = defineEmits<{
  region: [value: EditRegion | null]; highlight: [id: string | null]
  pickMode: [value: PickMode]; workPlane: [value: WorkPlane | null]; dragMode: [value: boolean]
  view: [value: 'front' | 'side' | 'top']; modified: [value: boolean]
}>()
const info = shallowRef<EditorInfo | null>(null)
const preview = shallowRef<SchematicPreviewData | null>(null)
const busy = ref(false)
const error = ref('')
const tab = ref<'replace' | 'crop'>('replace')
const originalId = ref('')
const replacementId = ref('minecraft:stone')
const preserveProperties = ref(true)
const scope = ref<'all' | 'region'>('all')
const cropPart = ref<'inside' | 'outside'>('inside')
const region = ref<EditRegion>({min: [0, 0, 0], max: [0, 0, 0]})
const picking = ref<PickMode>(null)
const dragMode = ref(false)
const planeAxis = ref(-1)
const planeCoordinate = ref(0)
const exportOpen = ref(false)
const exportBusy = ref(false)
const exportScope = ref<'all' | 'inside' | 'outside'>('all')
const exportSource = computed<ExportSource | null>(() => info.value ? {
  kind: 'editor', session_id: info.value.session_id, revision: info.value.revision,
  scope: exportScope.value, region: exportScope.value === 'all' ? null : region.value,
} : null)
let epoch = 0
let disposed = false
const axes = ['X', 'Y', 'Z'] as const
const dimensions = computed<EditorPoint>(() => info.value ? [info.value.size.width, info.value.size.height, info.value.size.length] : [0, 0, 0])
const regionValid = computed(() => validRegion(region.value, dimensions.value))
const showRegion = computed(() => tab.value === 'crop' || scope.value === 'region' || (exportOpen.value && exportScope.value !== 'all'))
const selectionSize = computed(() => regionValid.value ? region.value.max.map((n, a) => n - region.value.min[a] + 1).join(' × ') : '—')
const labels = computed(() => new Map((jeBlocks.value ?? []).map(block => [block.block_id, block.zh_cn || block.block_id])))
const sourceOptions = computed(() => (preview.value?.materials ?? []).map(item => ({value: item.id, title: `${labels.value.get(item.id) ?? item.id} · ${item.count}`})))
const targetOptions = computed(() => Array.from(new Set([...(jeBlocks.value ?? []).map(block => block.block_id), ...(preview.value?.materials ?? []).map(item => item.id)]))
  .map(id => ({value: id, title: `${labels.value.get(id) ?? id} (${id})`})))
const canonicalTarget = computed(() => {
  const id = String(replacementId.value ?? '').trim()
  return id && !id.includes(':') ? `minecraft:${id}` : id
})
const targetValid = computed(() => /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(canonicalTarget.value) && canonicalTarget.value.length <= 160)
const canReplace = computed(() => info.value && sourceOptions.value.some(item => item.value === originalId.value) && targetValid.value && originalId.value !== canonicalTarget.value && (scope.value !== 'region' || regionValid.value))

watch([region, regionValid, showRegion, info], () => emit('region', info.value && showRegion.value && regionValid.value ? region.value : null), {deep: true})
watch([originalId, tab, info], () => emit('highlight', info.value && tab.value === 'replace' ? originalId.value || null : null))
watch(picking, value => emit('pickMode', value), {flush: 'sync'})
watch([picking, planeAxis, planeCoordinate, dimensions], () => {
  const axis = planeAxis.value
  const coordinate = Number(planeCoordinate.value)
  emit('workPlane', (picking.value === 'first' || picking.value === 'second') && [0, 1, 2].includes(axis)
    && Number.isInteger(coordinate) && coordinate >= 0 && coordinate < dimensions.value[axis]
    ? {axis: axis as 0 | 1 | 2, coordinate} : null)
})
watch([dragMode, showRegion, regionValid, busy], () => emit('dragMode', dragMode.value && showRegion.value && regionValid.value && !busy.value))
watch(tab, () => { picking.value = null; dragMode.value = false; error.value = '' })
watch(info, value => emit('modified', !!value?.modified))

function selectAll() { region.value = {min: [0, 0, 0], max: dimensions.value.map(n => n - 1) as EditorPoint} }
function coordinate(edge: 'min' | 'max', axis: number, raw: string) {
  const values: EditorPoint = [...region.value[edge]]
  values[axis] = raw.trim() === '' ? NaN : Number(raw)
  region.value = {...region.value, [edge]: values}
}
function pick(pos: EditorPoint, id?: string) {
  if (busy.value || !info.value) return
  if (picking.value === 'block' && id) { originalId.value = id; picking.value = null; tab.value = 'replace' }
  else if (picking.value === 'first') { region.value = {min: [...pos], max: [...pos]}; picking.value = 'second' }
  else if (picking.value === 'second') {
    region.value = {min: pos.map((n, a) => Math.min(n, region.value.min[a])) as EditorPoint,
      max: pos.map((n, a) => Math.max(n, region.value.min[a])) as EditorPoint}
    picking.value = null
  }
}
function selectMaterial(id: string) { if (info.value && !busy.value) { originalId.value = id; tab.value = 'replace' } }
function adjustRegion(value: EditRegion) { if (!busy.value && validRegion(value, dimensions.value)) region.value = value }
function message(reason: unknown): string {
  const text = String(reason)
  const messages: [string, string][] = [
    ['2000000', '编辑副本最多支持 200 万条方块记录，请先拆分为较小蓝图。'],
    ['no matching blocks', '所选范围中没有匹配的原方块。'],
    ['no visible blocks', '裁剪结果没有可见方块，请调整选区。'],
    ['position cannot be determined', '存在无法安全定位的实体，已取消裁剪并保留原数据。'],
    ['outside the visible', '选区超出了当前蓝图范围。'],
    ['stale editor', '编辑状态已更新，本次操作未提交。'],
  ]
  return messages.find(([part]) => text.includes(part))?.[1] ?? text
}
function current(run: number) { return run === epoch && !disposed && !props.inactive }

async function start() {
  if (busy.value || info.value) return
  const run = ++epoch
  busy.value = true; error.value = ''
  let opened: EditorInfo | null = null
  try {
    const next = await openEditor(props.sourceId)
    opened = next.info
    if (!current(run)) return
    await props.applyPreview(next.preview)
    if (!current(run)) return
    info.value = next.info; preview.value = next.preview; opened = null
    originalId.value = next.preview.materials[0]?.id ?? ''
    selectAll()
    void fetchJeBlocks().catch(() => {})
  } catch (reason) { if (current(run)) error.value = message(reason) }
  finally {
    if (opened) await closeEditor(opened.session_id).catch(() => {})
    if (run === epoch) busy.value = false
  }
}

async function runAction(action: EditorAction) {
  const before = info.value
  const beforePreview = preview.value
  if (!before || !beforePreview || busy.value || props.inactive) return
  const run = ++epoch
  busy.value = true; error.value = ''; picking.value = null; dragMode.value = false
  let candidate: number | null = null
  let applied = false
  try {
    const next = await stageEdit(before, action)
    candidate = next.candidate_id
    if (!current(run) || candidate === null) return
    applied = true
    await props.applyPreview(next.preview)
    if (!current(run)) return
    const committed = await commitEdit(before, candidate)
    candidate = null
    // A commit already sent to native cannot be canceled by route navigation.
    // Keep its preview together with the acknowledged revision for reactivation.
    if (run === epoch && !disposed) {
      info.value = committed; preview.value = next.preview
      if (!next.preview.materials.some(item => item.id === originalId.value)) originalId.value = next.preview.materials[0]?.id ?? ''
      if (action.action !== 'edit' || action.operation.kind !== 'replace') selectAll()
    }
  } catch (reason) {
    if (current(run)) {
      error.value = message(reason)
      if (applied) {
        try { await props.applyPreview(beforePreview) }
        catch { error.value += '；上一个预览暂时无法恢复，原蓝图与编辑记录未被覆盖。' }
      }
    }
  } finally {
    if (candidate !== null) await cancelEdit(before, candidate).catch(() => {})
    if (run === epoch) busy.value = false
  }
}
function replace() {
  if (!canReplace.value) return
  void runAction({action: 'edit', operation: {kind: 'replace', original_id: originalId.value,
    replacement_id: canonicalTarget.value, preserve_properties: preserveProperties.value,
    region: scope.value === 'region' ? region.value : null}})
}
function crop() {
  if (regionValid.value) void runAction({action: 'edit', operation: {kind: cropPart.value === 'inside' ? 'crop' : 'crop_outside', region: region.value}})
}
async function release() {
  exportOpen.value = false
  ++epoch; busy.value = false; picking.value = null; dragMode.value = false
  const previous = info.value; info.value = null; preview.value = null
  if (previous) await closeEditor(previous.session_id).catch(() => {})
}
watch(() => props.sourceId, () => { void release(); error.value = '' })
// Leave the transaction epoch intact when hidden: an already acknowledged
// commit still belongs to this session. Inactive UI aborts staging/rendering.
onDeactivated(() => { picking.value = null; dragMode.value = false; if (!exportBusy.value) exportOpen.value = false })
onBeforeUnmount(() => { disposed = true; void release() })
defineExpose({getPreview: () => preview.value, pick, adjustRegion, selectMaterial})
</script>

<template>
  <v-card class="blueprint-editor" variant="tonal">
    <div class="editor-heading">
      <strong><v-icon size="20">mdi-vector-square-edit</v-icon> 预览编辑</strong>
      <v-chip v-if="info?.modified" size="x-small" color="warning">编辑副本</v-chip>
    </div>
    <p class="editor-note">编辑仅影响临时副本，不覆盖蓝图库原文件。切换页面会保留副本，关闭软件或切换蓝图会释放。</p>
    <v-btn v-if="!info" color="primary" block :loading="busy" :disabled="inactive" @click="start">开始副本编辑</v-btn>
    <template v-else>
      <div class="editor-actions">
        <v-btn size="small" variant="text" prepend-icon="mdi-undo" :disabled="busy || !info.undo_steps" @click="runAction({action: 'undo'})">撤销 ({{ info.undo_steps }})</v-btn>
        <v-btn size="small" variant="text" :disabled="busy || !info.modified" @click="runAction({action: 'reset'})">重置副本</v-btn>
      </div>
      <small class="editor-note">最多撤销 3 步，历史副本合计上限 400 万条方块记录。</small>
      <v-tabs v-model="tab" density="compact" grow :disabled="busy">
        <v-tab value="replace">替换方块</v-tab><v-tab value="crop">裁剪区域</v-tab>
      </v-tabs>
      <fieldset :disabled="busy || inactive" class="editor-fields">
        <template v-if="tab === 'replace'">
          <v-autocomplete v-model="originalId" :items="sourceOptions" label="原方块" item-title="title" item-value="value" density="compact" hide-details/>
          <v-combobox v-model="replacementId" :items="targetOptions" label="替换为（支持模组 ID）" item-title="title" item-value="value" :return-object="false" density="compact" hide-details/>
          <v-btn size="small" variant="outlined" :color="picking === 'block' ? 'primary' : undefined" @click="picking = picking === 'block' ? null : 'block'">从预览点选原方块</v-btn>
          <v-select v-model="scope" :items="[{title: '整个蓝图', value: 'all'}, {title: '仅选区', value: 'region'}]" label="替换范围" density="compact" hide-details/>
          <v-checkbox v-model="preserveProperties" label="保留原有方块状态" density="compact" hide-details/>
          <small class="editor-note">替换会移除被替换方块的容器等方块实体数据；保留状态不保证目标方块支持所有属性。</small>
          <small v-if="!targetValid" class="text-error">请输入合法的小写方块 ID。</small>
        </template>
        <template v-if="showRegion">
          <div class="editor-actions"><v-btn size="small" variant="outlined" @click="picking = 'first'; dragMode = false">点选两个角</v-btn><v-btn size="small" variant="text" @click="selectAll">全选</v-btn></div>
          <div class="editor-coordinates">
            <span></span><span>起点</span><span>终点（包含）</span>
            <template v-for="(axis, index) in axes" :key="axis">
              <label>{{ axis }}</label>
              <input v-for="edge in (['min', 'max'] as const)" :key="edge" type="number" min="0" :max="dimensions[index] - 1" step="1"
                :aria-label="`${axis} ${edge}`" :value="Number.isFinite(region[edge][index]) ? region[edge][index] : ''"
                @input="coordinate(edge, index, ($event.target as HTMLInputElement).value)"/>
            </template>
          </div>
          <small :class="regionValid ? 'editor-note' : 'text-error'">{{ regionValid ? `选区：${selectionSize}` : '请填写范围内的整数，终点不能小于起点。' }}</small>
          <v-select v-model="planeAxis" :items="[{title: '贴着方块点选', value: -1}, {title: 'X 工作平面', value: 0}, {title: 'Y 工作平面', value: 1}, {title: 'Z 工作平面', value: 2}]" label="点选方式" density="compact" hide-details/>
          <v-text-field v-if="planeAxis >= 0" v-model.number="planeCoordinate" type="number" label="工作平面坐标" :min="0" :max="dimensions[planeAxis] - 1" density="compact" hide-details/>
          <div class="editor-actions"><v-btn v-for="(view, index) in (['front', 'side', 'top'] as const)" :key="view" size="small" variant="text" @click="emit('view', view)">{{ ['正视', '侧视', '俯视'][index] }}</v-btn></div>
          <v-switch v-model="dragMode" label="拖动选区的面调整范围" density="compact" hide-details :disabled="!regionValid" @update:model-value="picking = null"/>
          <small v-if="dragMode" class="editor-note">拖动高亮框的表面；若表面正对相机，请先旋转视角。</small>
        </template>
        <v-select v-if="tab === 'crop'" v-model="cropPart" :items="[{title: '保留选区内部', value: 'inside'}, {title: '保留选区外部（内部清空）', value: 'outside'}]" label="裁剪方式" density="compact" hide-details/>
        <v-alert v-if="picking" density="compact" type="info" variant="tonal">{{ picking === 'block' ? '单击一个原方块' : picking === 'first' ? '单击第一个角' : '单击第二个角' }}<v-btn size="x-small" variant="text" @click="picking = null">取消</v-btn></v-alert>
      </fieldset>
      <v-btn v-if="tab === 'replace'" block color="primary" :disabled="!canReplace || inactive" :loading="busy" @click="replace">应用替换</v-btn>
      <v-btn v-else block color="primary" :disabled="!regionValid || inactive" :loading="busy" @click="crop">应用裁剪</v-btn>
      <v-btn block variant="tonal" prepend-icon="mdi-export" class="mt-3" :disabled="busy || inactive" @click="exportOpen = true">导出 / 保存副本</v-btn>
    </template>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3" role="alert">{{ error }}</v-alert>
    <v-dialog v-model="exportOpen" max-width="720" scrollable :persistent="exportBusy">
      <v-card v-if="info && exportSource">
        <v-card-title class="d-flex align-center justify-space-between">
          导出编辑副本
          <v-btn icon="mdi-close" variant="text" size="small" :disabled="exportBusy" aria-label="关闭导出" @click="exportOpen = false"/>
        </v-card-title>
        <v-card-text>
          <v-select v-model="exportScope" :disabled="exportBusy" :items="[{title: '整个当前副本', value: 'all'}, {title: '仅选区内部', value: 'inside'}, {title: '仅选区外部', value: 'outside'}]" label="导出范围" density="compact" hide-details class="mb-3"/>
          <v-alert v-if="exportScope !== 'all' && !regionValid" type="error" variant="tonal">当前选区无效，请先关闭弹窗并调整选区。</v-alert>
          <BlueprintExportPanel v-else :source="exportSource" :initial-format="info.source_format" :initial-subtype="info.source_subtype"
            :inactive="inactive" @busy="exportBusy = $event"/>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.blueprint-editor { padding: 14px; margin: 12px; }
.editor-heading, .editor-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.editor-heading { justify-content: space-between; }
.editor-note { font-size: 12px; opacity: .72; line-height: 1.6; margin: 8px 0; display: block; }
.editor-fields { border: 0; min-width: 0; padding: 12px 0; display: grid; gap: 10px; }
.editor-coordinates { display: grid; grid-template-columns: 20px 1fr 1fr; gap: 6px; align-items: center; font-size: 12px; }
.editor-coordinates input { min-width: 0; width: 100%; padding: 7px; border: 1px solid rgba(var(--v-theme-on-surface), .25); border-radius: 6px; color: inherit; }
</style>
