<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue'
import {exportError, getExportFormats, planExport, saveExport,
  type ExportSource, type ExportFormat, type ExportOptions, type ExportPlan, type ExportResult} from '../../modules/blueprint_export'
import {fetchJeBlocks, jeBlocks} from '../../modules/je_blocks'
import {fetchUserData} from '../../modules/user_data'
import {copySchematic} from '../../modules/copy_file'
import BlueprintFormatFields from './BlueprintFormatFields.vue'

const props = defineProps<{source: ExportSource; initialFormat?: number; initialSubtype?: number; fixedFormat?: boolean; inactive?: boolean; showCache?: boolean}>()
const emit = defineEmits<{saved: [result: ExportResult]; busy: [busy: boolean]}>()
const formats = shallowRef<ExportFormat[]>([])
const formatId = ref(props.initialFormat ?? 2)
const subtypeId = ref(props.initialSubtype ?? 6)
const versionId = ref(0)
const includeAir = ref(false)
const overrides = ref<Record<string, string>>({})
const plan = shallowRef<ExportPlan | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
let generation = 0
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
const format = computed(() => formats.value.find(item => item.id === formatId.value))
const subtype = computed(() => format.value?.subtypes.find(item => item.id === subtypeId.value))
const labels = computed(() => new Map((jeBlocks.value ?? []).map(block => [block.block_id, block.zh_cn || block.block_id])))
const title = (id: string) => labels.value.get(id) ?? id
const targets = computed(() => (plan.value?.compatibility?.targetBlocks ?? [])
  .map(id => ({value: id, title: `${title(id)} · ${id}`})))
const changes = computed(() => plan.value?.compatibility?.changes ?? [])
const unresolved = computed(() => changes.value.filter(row => row.error && !overrides.value[row.sourceId]).length)
const options = computed<ExportOptions>(() => ({
  format: formatId.value, subtype: subtypeId.value,
  targetDataVersion: formatId.value === 5 || !versionId.value ? null : versionId.value,
  includeAir: formatId.value === 1 && includeAir.value,
  overrides: Object.entries(overrides.value).filter(([, value]) => !!value)
    .map(([sourceId, replacementId]) => ({sourceId, replacementId})),
}))
const ready = computed(() => !!plan.value && !loading.value && !saving.value && !unresolved.value && !props.inactive)
function updateFields(value:ExportOptions) {
  formatId.value=value.format;subtypeId.value=value.subtype;versionId.value=value.targetDataVersion??0;includeAir.value=value.includeAir
}
watch(saving, value => emit('busy', value), {flush: 'sync'})
watch(formatId, () => {
  subtypeId.value = format.value?.subtypes[0]?.id ?? -1
  versionId.value = 0; includeAir.value = false
}, {flush: 'sync'})
watch(subtypeId, () => { if (!subtype.value?.versions.some(v => v.id === versionId.value)) versionId.value = 0 }, {flush: 'sync'})

function schedule() {
  ++generation
  clearTimeout(timer)
  plan.value = null; overrides.value = {}; error.value = ''; success.value = ''
  if (disposed || props.inactive || !subtype.value) { loading.value = false; return }
  loading.value = true
  timer = setTimeout(() => { void refresh() }, 180)
}
watch([() => JSON.stringify(props.source), formatId, subtypeId, versionId, includeAir, () => props.inactive], schedule, {flush: 'sync'})
async function refresh() {
  if (!subtype.value || saving.value || props.inactive) return
  const run = ++generation
  loading.value = true; error.value = ''
  try {
    const next = await planExport(props.source, {...options.value, overrides: []})
    if (!disposed && generation === run) plan.value = next
  } catch (reason) { if (!disposed && generation === run) error.value = exportError(reason) }
  finally { if (generation === run) loading.value = false }
}
async function save(destination: ExportResult['destination']) {
  if (!ready.value) return
  if (destination === 'converted' && !plan.value?.canSaveCache) return
  saving.value = true; error.value = ''; success.value = ''
  let savedCache = false
  try {
    const result = await saveExport(props.source, options.value, destination)
    if (result.canceled) return
    savedCache = destination === 'converted'
    if (destination === 'library') void fetchUserData()
    if (!disposed) {
      success.value = `${destination === 'library' ? '已新增到蓝图库' : destination === 'converted' ? '已更新转换文件' : '已另存'}：${result.filename}（${(result.bytes / 1024).toFixed(1)} KiB）`
      emit('saved', result)
    }
  } catch (reason) { if (!disposed) error.value = exportError(reason) }
  finally { saving.value = false; if (savedCache && !disposed) void refresh() }
}
async function exportCached() {
  const source = props.source
  if (!plan.value?.cached || source.kind !== 'library' || saving.value || props.inactive) return
  saving.value = true
  try {
    await copySchematic(source.id, [3, 4].includes(formatId.value) ? subtypeId.value : -1,
      source.version, formatId.value, `converted_${source.id}_${plan.value.cached.output?.game_version ?? 'existing'}`)
  } finally { saving.value = false }
}
async function initialize() {
  error.value = ''
  try {
    const next = await getExportFormats()
    if (disposed) return
    formats.value = next
    if (!format.value) formatId.value = next[0].id
    if (!subtype.value) subtypeId.value = format.value!.subtypes[0].id
    schedule()
    void fetchJeBlocks().catch(() => {})
  } catch (reason) { if (!disposed) error.value = exportError(reason) }
}
onMounted(initialize)
onBeforeUnmount(() => {
  disposed = true; ++generation; clearTimeout(timer)
  // A native save may finish after navigation. Do not leave the cached parent
  // permanently busy after this component's watcher has been stopped.
  emit('busy', false)
})
</script>

<template>
  <section class="blueprint-export-panel">
    <p v-if="source.kind === 'generated'" class="export-note">使用已准备的生成结果，基准版本为 Java 1.21.1。可独立选择格式与目标游戏版本；另存不会覆盖已有文件。关闭弹窗后释放临时导出副本。</p>
    <p v-else class="export-note">导出的是独立副本，不覆盖原蓝图，也不会消耗撤销记录。只转换格式时不自动降级方块。</p>
    <BlueprintFormatFields :model-value="options" :formats="formats" :disabled="saving || inactive" :fixed-format="fixedFormat" @update:model-value="updateFields"/>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="my-3"/>
    <div v-if="plan" class="export-summary">
      <v-chip size="small">尺寸 {{ plan.size.width }} × {{ plan.size.height }} × {{ plan.size.length }}</v-chip>
      <v-chip size="small">源版本标识：{{ plan.sourceDataVersion ?? '未知' }}</v-chip>
      <v-chip v-if="formatId !== 5 && formatId !== 4" size="small">输出：{{ plan.outputDataVersion ?? '未指定' }}</v-chip>
    </div>
    <template v-if="plan?.compatibility">
      <p class="export-note">兼容预览：{{ changes.length }} 种方块有 ID 或状态变化。自定义替换只接受目标版本存在的方块，按原始 ID 同时应用；替换容器类型会移除其载荷。</p>
      <v-alert v-if="!changes.length" type="success" density="compact" variant="tonal">方块与状态无需兼容替换。</v-alert>
      <v-virtual-scroll v-else :items="changes" :height="Math.min(360, changes.length * 132)" :item-height="132" class="export-changes">
        <template #default="{item}">
          <div class="export-change">
            <div class="export-change-heading"><strong>{{ title(item.sourceId) }}</strong><v-chip size="x-small">{{ item.count }}</v-chip></div>
            <div class="export-id">{{ item.sourceId }}</div>
            <v-autocomplete v-model="overrides[item.sourceId]" :items="targets" clearable
              :label="item.replacementId ? `自动：${title(item.replacementId)}${item.propertiesChanged ? '（状态调整）' : ''}` : '必须选择替换方块'"
              :disabled="saving" density="compact" variant="outlined" hide-details/>
            <small v-if="item.error" :class="overrides[item.sourceId] ? 'export-note' : 'text-error'">{{ item.error }}</small>
          </div>
        </template>
      </v-virtual-scroll>
      <small v-if="unresolved" class="text-error">还有 {{ unresolved }} 种方块需要指定替换目标。</small>
    </template>
    <v-alert v-for="warning in plan?.warnings ?? []" :key="warning" type="warning" density="compact" variant="tonal" class="my-2">{{ warning }}</v-alert>
    <v-alert v-if="error" type="error" density="compact" variant="tonal" class="my-3" role="alert">
      {{ error }}
      <v-btn variant="text" size="small" :disabled="saving" @click="formats.length ? refresh() : initialize()">重试</v-btn>
    </v-alert>
    <v-alert v-if="success" type="success" density="compact" variant="tonal" class="my-3" role="status">{{ success }}</v-alert>
    <p v-if="showCache && plan" class="export-note">
      <template v-if="!plan.canSaveCache">此格式位置是原蓝图，不能覆盖；可以另存副本或新增到蓝图库。</template>
      <template v-else-if="plan.cached">已有转换文件：{{ (Number(plan.cached.size) / 1024).toFixed(1) }} KiB，
        游戏版本 {{ plan.cached.output?.game_version ?? '未记录' }}。更新会替换此转换文件，不改动原蓝图。
      </template>
      <template v-else>可生成并保留此格式的转换文件，之后从当前蓝图的格式卡片导出。</template>
    </p>
    <div class="export-actions">
      <v-btn v-if="showCache && plan?.cached && plan.canSaveCache" variant="outlined" :disabled="saving || inactive" @click="exportCached">导出已有文件（不应用当前设置）</v-btn>
      <v-btn v-if="showCache" color="primary" :disabled="!ready || !plan?.canSaveCache" :loading="saving" @click="save('converted')">生成 / 更新转换文件</v-btn>
      <v-btn color="primary" prepend-icon="mdi-content-save-outline" :disabled="!ready" :loading="saving" @click="save('file')">另存副本文件</v-btn>
      <v-btn variant="tonal" prepend-icon="mdi-folder-plus-outline" :disabled="!ready" @click="save('library')">新增到蓝图库</v-btn>
    </div>
  </section>
</template>

<style scoped>
.export-note { font-size: 12px; line-height: 1.6; opacity: .75; margin: 8px 0 12px; display: block; }
.export-summary, .export-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.export-change { min-height: 132px; padding: 8px 2px 12px; }
.export-change-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.export-id { font-size: 11px; opacity: .65; overflow-wrap: anywhere; margin: 3px 0 9px; }
.export-changes { padding-right: 10px; }
</style>
