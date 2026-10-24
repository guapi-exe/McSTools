<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue'
import {exportError as rawExportError, exportWarning, getExportFormats, planExport, saveExport,
  type ExportSource, type ExportFormat, type ExportOptions, type ExportPlan, type ExportResult} from '../../modules/blueprint_export'
import {fetchUserData} from '../../modules/user_data'
import {copySchematic} from '../../modules/copy_file'
import {materialName} from '../../modules/materials/block_names'
import BlueprintFormatFields from './BlueprintFormatFields.vue'

const {t: $t, locale} = useI18n()
const exportError = (reason: unknown) => rawExportError(reason, $t)

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
const title = (id: string) => materialName(id, locale.value)
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
      success.value = $t(`desktop.${destination === 'library' ? 'savedLibrary' : destination === 'converted' ? 'savedConversion' : 'savedCopy'}`, {name: result.filename ?? '', size: (result.bytes / 1024).toFixed(1)})
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
    <p v-if="source.kind === 'generated'" class="export-note">{{ $t('desktop.exportGeneratedNote') }}</p>
    <p v-else class="export-note">{{ $t('desktop.exportCopyNote') }}</p>
    <BlueprintFormatFields :model-value="options" :formats="formats" :disabled="saving || inactive" :fixed-format="fixedFormat" @update:model-value="updateFields"/>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="my-3"/>
    <div v-if="plan" class="export-summary">
      <v-chip size="small">{{ $t('desktop.exportSize', {size: [plan.size.width, plan.size.height, plan.size.length].join(' × ')}) }}</v-chip>
      <v-chip size="small">{{ $t('desktop.sourceVersion', {version: plan.sourceDataVersion ?? $t('desktop.unknown')}) }}</v-chip>
      <v-chip v-if="formatId !== 5 && formatId !== 4" size="small">{{ $t('desktop.outputVersion', {version: plan.outputDataVersion ?? $t('desktop.unspecified')}) }}</v-chip>
    </div>
    <template v-if="plan?.compatibility">
      <p class="export-note">{{ $t('desktop.compatibilityNote', {count: changes.length}) }}</p>
      <v-alert v-if="!changes.length" type="success" density="compact" variant="tonal">{{ $t('desktop.noChanges') }}</v-alert>
      <v-virtual-scroll v-else :items="changes" :height="Math.min(360, changes.length * 132)" :item-height="132" class="export-changes">
        <template #default="{item}">
          <div class="export-change">
            <div class="export-change-heading"><strong>{{ title(item.sourceId) }}</strong><v-chip size="x-small">{{ item.count }}</v-chip></div>
            <div class="export-id">{{ item.sourceId }}</div>
            <v-autocomplete v-model="overrides[item.sourceId]" :items="targets" clearable
              :label="item.replacementId ? $t('desktop.autoReplacement', {name: title(item.replacementId), state: item.propertiesChanged ? $t('desktop.stateAdjusted') : ''}) : $t('desktop.replacementRequired')"
              :disabled="saving" density="compact" variant="outlined" hide-details/>
            <small v-if="item.error" :class="overrides[item.sourceId] ? 'export-note' : 'text-error'">{{ item.error }}</small>
          </div>
        </template>
      </v-virtual-scroll>
      <small v-if="unresolved" class="text-error">{{ $t('desktop.unresolved', {count: unresolved}) }}</small>
    </template>
    <v-alert v-for="warning in plan?.warnings ?? []" :key="warning" type="warning" density="compact" variant="tonal" class="my-2">{{ exportWarning(warning, $t) }}</v-alert>
    <v-alert v-if="error" type="error" density="compact" variant="tonal" class="my-3" role="alert">
      {{ error }}
      <v-btn variant="text" size="small" :disabled="saving" @click="formats.length ? refresh() : initialize()">{{ $t('desktop.retry') }}</v-btn>
    </v-alert>
    <v-alert v-if="success" type="success" density="compact" variant="tonal" class="my-3" role="status">{{ success }}</v-alert>
    <p v-if="showCache && plan" class="export-note">
      <template v-if="!plan.canSaveCache">{{ $t('desktop.sourceSlot') }}</template>
      <template v-else-if="plan.cached">{{ $t('desktop.cachedDetails', {size: (Number(plan.cached.size) / 1024).toFixed(1), version: plan.cached.output?.game_version ?? $t('desktop.unrecorded')}) }}
      </template>
      <template v-else>{{ $t('desktop.cacheNote') }}</template>
    </p>
    <div class="export-actions">
      <v-btn v-if="showCache && plan?.cached && plan.canSaveCache" variant="outlined" :disabled="saving || inactive" @click="exportCached">{{ $t('desktop.exportCached') }}</v-btn>
      <v-btn v-if="showCache" color="primary" :disabled="!ready || !plan?.canSaveCache" :loading="saving" @click="save('converted')">{{ $t('desktop.updateConversion') }}</v-btn>
      <v-btn color="primary" prepend-icon="mdi-content-save-outline" :disabled="!ready" :loading="saving" @click="save('file')">{{ $t('desktop.saveCopy') }}</v-btn>
      <v-btn variant="tonal" prepend-icon="mdi-folder-plus-outline" :disabled="!ready" @click="save('library')">{{ $t('desktop.addLibrary') }}</v-btn>
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
