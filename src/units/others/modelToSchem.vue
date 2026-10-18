<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {computed, defineAsyncComponent, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, shallowRef, watch} from 'vue'
import {materialName} from '../../modules/materials/block_names'
import {ensureMapArtData, mapArtData} from '../../modules/map_art/map_art_data'
import {loadLocalModel, disposeModel} from '../../modules/toolbox/model-loader'
import {runVoxelModel} from '../../modules/toolbox/model-client'
import {defaultColorSettings, type GeneratedStructure, type RGB, type ToolBlock, type VoxelSettings} from '../../modules/toolbox/types'
import ToolModelPreview from './ToolModelPreview.vue'

const {t: $t, locale} = useI18n()

const ToolPalettePicker = defineAsyncComponent(() => import('./ToolPalettePicker.vue'))
const GeneratedBlueprintExport = defineAsyncComponent(() => import('./GeneratedBlueprintExport.vue'))
const files = ref<File[]>([]), name = ref('model'), selectedBlocks = ref<string[]>([])
const model = shallowRef<Awaited<ReturnType<typeof loadLocalModel>>>()
const result = shallowRef<GeneratedStructure>()
const settings = reactive<VoxelSettings>({...defaultColorSettings, resolution: 64, solid: false, useColors: true, blockId: 'minecraft:stone', rotateX: 0, rotateY: 0, rotateZ: 0})
const rotation = computed(() => [settings.rotateX, settings.rotateY, settings.rotateZ])
const mode = ref<'source' | 'blocks'>('source'), error = ref(''), loading = ref(false), generating = ref(false), progress = ref(0)
const stale = ref(false), showExport = ref(false), ready = ref(false), dragging = ref(false)
const allBlocks = computed<ToolBlock[]>(() => (mapArtData.value ?? []).flatMap(category => category.items.map(block => ({
  id: block.id.includes(':') ? block.id : 'minecraft:' + block.id, label: materialName(block.id, locale.value), group: category.name,
  color: block.average_rgb as unknown as RGB, normal: block.normal_rgb as unknown as RGB,
  low: block.low_rgb as unknown as RGB, high: block.high_rgb as unknown as RGB,
}))))
const labels = computed(() => new Map(allBlocks.value.map(block => [block.id,block.label])))
const materials = computed(() => Object.entries(result.value?.counts ?? {}).sort((a,b) => b[1]-a[1]).slice(0,8))
let active = true, disposed = false, epoch = 0, loadEpoch = 0
let controller: AbortController | undefined, loadController: AbortController | undefined
function cancelGeneration() {
  ++epoch; controller?.abort(); controller = undefined; generating.value = false
}
function cancelLoad() {
  ++loadEpoch; loadController?.abort(); loadController = undefined; loading.value = false
}
function dirty() { cancelGeneration(); if (model.value) stale.value = true }
watch(settings, dirty, {flush:'sync'})
watch(selectedBlocks, dirty, {flush:'sync'})
async function loadFiles(input: File[] | File | null | undefined) {
  const next = Array.isArray(input) ? input : input ? [input] : []
  files.value = next
  cancelLoad(); cancelGeneration(); error.value = ''
  if (!next.length) {
    disposeModel(model.value?.object); model.value = undefined; result.value = undefined; stale.value = false; mode.value = 'source'
    return
  }
  const run = loadEpoch, task = new AbortController(); loadController = task; loading.value = true
  try {
    // Paint the loading state before the format loader starts allocating geometry.
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve,0)))
    task.signal.throwIfAborted()
    const loaded = await loadLocalModel(next,task.signal)
    if (run !== loadEpoch || !active || disposed) { disposeModel(loaded.object); return }
    const previous = model.value
    model.value = loaded; name.value = loaded.name; result.value = undefined; mode.value = 'source'; stale.value = true
    disposeModel(previous?.object)
  } catch (reason) {
    if (run === loadEpoch && active && !task.signal.aborted) error.value = String(reason)
  } finally { if (run === loadEpoch) { loading.value = false; loadController = undefined } }
}
async function generate() {
  if (!model.value || !active || !ready.value || loading.value) return
  cancelGeneration(); error.value = ''; stale.value = true
  const run = epoch, source = model.value, chosen = new Set(selectedBlocks.value)
  const options = {...settings, fillColor: allBlocks.value.find(block => block.id === settings.blockId)?.color}
  const palette = allBlocks.value.filter(block => options.useColors ? chosen.has(block.id.replace(/^minecraft:/,'')) || chosen.has(block.id) : block.id === options.blockId)
  const task = new AbortController(); controller = task; generating.value = true; progress.value = 0
  try {
    if (options.useColors && !palette.length) throw new Error($t('desktop.modelChooseBlocks'))
    const generated = await runVoxelModel(source.triangles, options, palette, task.signal, n => { if (run === epoch) progress.value = n })
    if (run !== epoch || !active || disposed) return
    result.value = generated; stale.value = false; mode.value = 'blocks'
  } catch (reason) {
    if (run === epoch && active && !task.signal.aborted) error.value = String(reason)
  } finally { if (run === epoch) { generating.value = false; controller = undefined } }
}
async function prepareExport() {
  if (!result.value || stale.value) await generate()
  if (!result.value || stale.value || !active || loading.value) throw new Error(error.value || $t('desktop.modelExpired'))
  return {structure: result.value, name: name.value.trim() || 'model'}
}
function closeExport() { showExport.value = false; cancelGeneration() }
function drop(event: DragEvent) {
  dragging.value = false
  if (showExport.value) return
  if (event.dataTransfer?.files.length) void loadFiles(Array.from(event.dataTransfer.files))
}
onMounted(async () => {
  try {
    const data = await ensureMapArtData()
    if (disposed) return
    selectedBlocks.value = data.filter(category => ['stone','wool','concrete'].includes(category.name)).flatMap(category => category.items.map(block => block.id))
    ready.value = true
  } catch (reason) { if (!disposed) error.value = String(reason) }
})
onActivated(() => { active = true })
onDeactivated(() => { active = false; cancelLoad(); cancelGeneration(); showExport.value = false; dragging.value = false })
onBeforeUnmount(() => {
  disposed = true; active = false; cancelLoad(); cancelGeneration()
  disposeModel(model.value?.object); model.value = undefined; result.value = undefined
})
</script>

<template>
  <v-row no-gutters class="model-editor-row" data-testid="model-tool">
    <v-col cols="12" md="4" class="pa-4 config-column">
      <div class="model-config">
        <div class="model-drop rounded-lg pa-3 mb-4" :class="{'is-dragging': dragging}" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop">
          <v-file-input :model-value="files" multiple show-size chips clearable density="compact" variant="outlined" :label="$t('desktop.modelFiles')" accept=".obj,.mtl,.stl,.gltf,.glb,.bin,.png,.jpg,.jpeg,.webp" :disabled="showExport" :loading="loading" hide-details @update:model-value="loadFiles"/>
          <p class="text-caption text-medium-emphasis mt-2">{{ $t('desktop.modelFilesNote') }}</p>
          <v-btn v-if="loading" size="small" variant="text" color="warning" @click="cancelLoad">{{ $t('desktop.cancelRead') }}</v-btn>
          <p v-if="model" class="text-caption mt-2" data-testid="model-loaded">{{ $t('desktop.modelLoaded', {name: model.name, count: model.triangleCount.toLocaleString()}) }}</p>
        </div>
        <v-text-field v-model="name" :label="$t('desktop.outputName')" density="compact" hide-details class="mb-4" :disabled="showExport"/>
        <v-number-input v-model="settings.resolution" :label="$t('desktop.resolution')" :min="8" :max="128" :step="8" density="compact" :disabled="showExport" control-variant="split" hide-details/>
        <p class="text-caption text-medium-emphasis mt-2 mb-3">{{ $t('desktop.resolutionNote') }}</p>
        <v-switch v-model="settings.solid" :label="$t('desktop.fillSolid')" color="primary" density="compact" hide-details :disabled="showExport"/>
        <p class="text-caption text-medium-emphasis mb-2">{{ $t('desktop.fillNote') }}</p>
        <v-switch v-model="settings.useColors" :label="$t('desktop.modelMatch')" color="primary" density="compact" hide-details :disabled="showExport"/>
        <v-autocomplete v-model="settings.blockId" :items="allBlocks" item-title="label" item-value="id" :label="settings.useColors ? $t('desktop.fillBlock') : $t('desktop.uniformBlock')" density="compact" hide-details class="my-3" :disabled="showExport"/>
        <ToolPalettePicker v-if="settings.useColors" v-model="selectedBlocks" :disabled="!ready || showExport"/>
        <v-expansion-panels variant="accordion" class="mt-3">
          <v-expansion-panel :title="$t('desktop.modelRotation')">
            <v-expansion-panel-text>
              <div v-for="axis in (['X','Y','Z'] as const)" :key="axis" class="mb-3">
                <v-text-field v-model.number="settings[`rotate${axis}`]" type="number" :label="$t('desktop.axisRotation', {axis})" density="compact" hide-details :disabled="showExport"/>
                <div class="d-flex flex-wrap ga-1 mt-1"><v-btn v-for="angle in [0,90,180,270]" :key="angle" size="x-small" variant="tonal" :disabled="showExport" @click="settings[`rotate${axis}`] = angle">{{ angle }}°</v-btn></div>
              </div>
              <p class="text-caption text-medium-emphasis">{{ $t('desktop.rotationNote') }}</p>
            </v-expansion-panel-text>
          </v-expansion-panel>
          <v-expansion-panel :title="$t('desktop.colorMatching')" :disabled="!settings.useColors">
            <v-expansion-panel-text>
              <v-select v-model="settings.match" :items="[{title:$t('desktop.oklab'),value:'oklab'},{title:$t('desktop.rgb'),value:'rgb'},{title:$t('desktop.weighted'),value:'weighted'},{title:'Redmean',value:'redmean'}]" :label="$t('desktop.matchMode')" density="compact" :disabled="showExport"/>
              <v-slider v-model="settings.brightness" :label="$t('desktop.brightness')" :min=".5" :max="1.5" :step=".05" thumb-label :disabled="showExport"/>
              <v-slider v-model="settings.contrast" :label="$t('desktop.contrast')" :min=".5" :max="1.5" :step=".05" thumb-label :disabled="showExport"/>
              <v-slider v-model="settings.saturation" :label="$t('desktop.saturation')" :min="0" :max="2" :step=".05" thumb-label :disabled="showExport"/>
              <v-slider v-model="settings.gamma" label="Gamma" :min=".5" :max="2" :step=".05" thumb-label :disabled="showExport"/>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <div class="model-actions pt-4">
          <v-btn color="info" variant="tonal" block prepend-icon="mdi-cube-scan" :disabled="!model || !ready || loading || generating || showExport" @click="generate">{{ $t('desktop.generatePreview') }}</v-btn>
          <v-btn color="primary" block prepend-icon="mdi-export" :disabled="!model || !ready || loading || generating || showExport" @click="showExport = true">{{ $t('desktop.exportVersion') }}</v-btn>
        </div>
      </div>
    </v-col>
    <v-col cols="12" md="8" class="pa-4 preview-column">
      <v-alert v-if="error" type="error" variant="tonal" closable class="mb-3" role="alert" @click:close="error = ''">{{ error }}</v-alert>
      <div class="d-flex flex-wrap align-center ga-2 mb-3">
        <v-btn-toggle v-model="mode" mandatory color="primary" density="compact" variant="tonal"><v-btn value="source">{{ $t('desktop.sourceModel') }}</v-btn><v-btn value="blocks">{{ $t('desktop.blockPreview') }}</v-btn></v-btn-toggle>
        <v-chip v-if="stale && result" color="warning" size="small">{{ $t('desktop.modelStale') }}</v-chip>
        <v-spacer/><v-btn v-if="generating" color="warning" variant="tonal" size="small" @click="cancelGeneration">{{ $t('desktop.cancelGeneration') }}</v-btn>
      </div>
      <v-progress-linear v-if="generating" :model-value="progress" color="primary" height="18" class="mb-3"><span class="text-caption">{{ $t('desktop.generating', {progress}) }}</span></v-progress-linear>
      <ToolModelPreview :model="model?.object" :structure="result" :mode="mode" :rotation="rotation"/>
      <v-card v-if="result" variant="tonal" class="mt-3 pa-3" data-testid="model-result">
        <div class="d-flex flex-wrap ga-3 text-body-2"><strong>{{ $t('desktop.blockCount', {count: result.blockCount.toLocaleString()}) }}</strong><span>{{ result.size.join(' × ') }}</span><span>{{ $t('desktop.materialCount', {count: Object.keys(result.counts).length}) }}</span></div>
        <div class="d-flex flex-wrap ga-2 mt-2"><v-chip v-for="[id,count] in materials" :key="id" size="small" :title="id">{{ labels.get(id) || id.replace('minecraft:','') }} · {{ count.toLocaleString() }}</v-chip></div>
        <p class="text-caption text-medium-emphasis mt-2">{{ $t('desktop.modelMaterialsNote') }}</p>
      </v-card>
    </v-col>
    <GeneratedBlueprintExport v-if="showExport" :prepare="prepareExport" @close="closeExport"/>
  </v-row>
</template>

<style scoped>
.model-editor-row { min-width: 0; align-items: stretch; color: rgb(var(--v-theme-on-surface)); }
.config-column, .preview-column { min-width: 0; }
.model-config { max-height: calc(100dvh - 150px); overflow-y: auto; padding-right: 6px; scrollbar-gutter: stable; }
.model-drop { border: 1px dashed rgba(var(--v-theme-on-surface), .28); transition: background-color 120ms; }
.model-drop.is-dragging { background: rgba(var(--v-theme-primary), .1); }
.model-actions { display: grid; gap: 10px; }
@media (max-width: 959px) { .model-config { max-height: none; padding-right: 0; } }
@media (prefers-reduced-motion: reduce) { .model-drop { transition: none; } }
</style>

