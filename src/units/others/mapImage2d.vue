<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, shallowRef, watch} from 'vue'
import {materialName} from '../../modules/materials/block_names'
import {ensureMapArtData, mapArtData} from '../../modules/map_art/map_art_data'
import {toast} from '../../modules/others'
import {encode_image, image_data, releaseProcessedImage} from '../../modules/map_art/encode_image'
import {runMapArt} from '../../modules/toolbox/map-art-client'
import {fitAspect} from '../../modules/toolbox/map-art'
import {mapColorCanvas, mapTextureCanvas} from '../../modules/toolbox/map-art-preview'
import type {MapArtResult, RGB, ToolBlock} from '../../modules/toolbox/types'
import {useI18n} from 'vue-i18n'
const ToolPalettePicker = defineAsyncComponent(() => import('./ToolPalettePicker.vue'))
const GeneratedBlueprintExport = defineAsyncComponent(() => import('./GeneratedBlueprintExport.vue'))
const {t: $t, locale} = useI18n()
const exportSettings = reactive({
  width: 128, height: 128, maxResolution: 2048,
  axios: 'y' as 'x' | 'y' | 'z', targetRotation: 0,
  ditherMode: 'floyd' as 'floyd' | 'atkinson' | 'ordered' | 'none',
  adaptiveThreshold: .35, matchMode: 'oklab' as 'rgb' | 'weighted' | 'redmean' | 'oklab',
  brightness: 1, contrast: 1, saturation: 1, gamma: 1,
  alphaThreshold: 127, backing: false, support: false, supportBlock: 'minecraft:stone',
})
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const resize = ref(1), isProcessing = ref(false), progress = ref(0)
const exportImageLoading = ref(false), dialog = ref(false), fullscreenDialog = ref(false)
const selectedBlocks = ref<string[]>([])
const mapImg = ref<File>(), finallyImage = shallowRef<HTMLCanvasElement>()
const threeD = ref(false), maxZ = ref(60), blocksLoaded = ref(false)
const result = shallowRef<MapArtResult>()
const hasImage = computed(() => !!result.value)
const stale = ref(false)
let controller: AbortController | undefined, imageController: AbortController | undefined
let epoch = 0, uploadEpoch = 0, active = true, disposed = false
const fullscreenCanvas = ref<HTMLCanvasElement | null>(null)
const fsScale = ref(1)
const fsOffset = reactive({ x: 0, y: 0 })
const fsDragging = ref(false)
const fsDragStart = reactive({ x: 0, y: 0 })
const fsCanvasStyle = computed(() => ({
  transform: `translate(${fsOffset.x}px, ${fsOffset.y}px) scale(${fsScale.value})`,
  transformOrigin: 'center center',
  cursor: fsDragging.value ? 'grabbing' : 'grab'
}))

const resetFullscreenView = () => {
  fsScale.value = 1
  fsOffset.x = 0
  fsOffset.y = 0
}

const openFullscreen = async () => {
  if (!finallyImage.value) return
  fullscreenDialog.value = true
  await nextTick()
  const canvas = fullscreenCanvas.value
  if (!canvas) return
  canvas.width = finallyImage.value.width
  canvas.height = finallyImage.value.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(finallyImage.value, 0, 0)
  resetFullscreenView()
}

const onFullscreenWheel = (event: WheelEvent) => {
  event.preventDefault()
  const nextScale = Math.min(8, Math.max(0.2, fsScale.value * (event.deltaY > 0 ? 0.9 : 1.1)))
  fsScale.value = nextScale
}

const onFullscreenMouseDown = (event: MouseEvent) => {
  fsDragging.value = true
  fsDragStart.x = event.clientX - fsOffset.x
  fsDragStart.y = event.clientY - fsOffset.y
}

const onFullscreenMouseMove = (event: MouseEvent) => {
  if (!fsDragging.value) return
  fsOffset.x = event.clientX - fsDragStart.x
  fsOffset.y = event.clientY - fsDragStart.y
}

const onFullscreenMouseUp = () => {
  fsDragging.value = false
}

function cancelWork() {
  ++epoch; controller?.abort(); imageController?.abort()
  controller = undefined; imageController = undefined
  isProcessing.value = false; exportImageLoading.value = false
}
watch([exportSettings, selectedBlocks, threeD, maxZ], () => {
  cancelWork(); stale.value = !!result.value
}, {deep: true, flush: 'sync'})

async function refreshImage() {
  if (!image_data.value || !blocksLoaded.value || !active) return
  cancelWork()
  const run = epoch, source = image_data.value, options = {...exportSettings}
  const relief = threeD.value, maxHeight = maxZ.value
  const selected = new Set(selectedBlocks.value)
  const palette: ToolBlock[] = (mapArtData.value ?? []).flatMap(category => category.items
    .filter(block => selected.has(block.id)).map(block => ({
      id: block.id.includes(':') ? block.id : 'minecraft:' + block.id, label: materialName(block.id, locale.value), group: category.name,
      color: block.average_rgb as unknown as RGB, normal: block.normal_rgb as unknown as RGB,
      low: block.low_rgb as unknown as RGB, high: block.high_rgb as unknown as RGB,
    })))
  const task = new AbortController(); controller = task
  isProcessing.value = true; progress.value = 0
  try {
    const {width, height} = options
    if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 2048) || width * height > 1024 * 1024) throw new Error($t('desktop.pixelLimit'))
    if (!palette.length) throw new Error($t('desktop.chooseBlocks'))
    const bitmap = await createImageBitmap(source.file, {resizeWidth: width, resizeHeight: height, resizeQuality: 'high'})
    let rgba: Uint8ClampedArray, w: number, h: number
    try {
      if (task.signal.aborted) return
      const swapped = options.targetRotation === 90 || options.targetRotation === 270
      w = swapped ? height : width; h = swapped ? width : height
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d', {willReadFrequently: true})
      if (!ctx) throw new Error($t('desktop.readImage'))
      ctx.translate(w / 2, h / 2); ctx.rotate(options.targetRotation * Math.PI / 180)
      ctx.drawImage(bitmap, -width / 2, -height / 2, width, height)
      rgba = ctx.getImageData(0, 0, w, h).data
      canvas.width = canvas.height = 0
    } finally { bitmap.close() }
    const next = await runMapArt({width: w, height: h, rgba, palette, settings: {
      match: options.matchMode, brightness: options.brightness, contrast: options.contrast,
      saturation: options.saturation, gamma: options.gamma, dither: options.ditherMode,
      adaptive: options.adaptiveThreshold, relief, maxHeight, axis: options.axios,
      alphaThreshold: options.alphaThreshold, backing: options.backing, support: options.support,
      supportBlock: options.supportBlock,
    }}, task.signal, value => { if (run === epoch) progress.value = value })
    if (run !== epoch || !active || disposed) return
    const canvas = mapColorCanvas(next)
    if (finallyImage.value) finallyImage.value.width = finallyImage.value.height = 0
    finallyImage.value = canvas; result.value = next; stale.value = false
    await nextTick()
    if (run !== epoch || !previewCanvas.value) return
    previewCanvas.value.width = canvas.width; previewCanvas.value.height = canvas.height
    previewCanvas.value.getContext('2d')?.drawImage(canvas, 0, 0)
  } catch (error) {
    if (run === epoch && active && !task.signal.aborted) toast.error($t('desktop.mapFailed', {error: String(error)}), {timeout: 5000})
  } finally { if (run === epoch) { isProcessing.value = false; controller = undefined } }
}
async function uploadImage(file?: File) {
  if (!file) { cleanImage(); return }
  cancelWork(); const run = ++uploadEpoch
  try {
    if (file.size > 64 * 1024 * 1024) throw new Error($t('desktop.imageLimit'))
    const data = await encode_image(file)
    if (run !== uploadEpoch || !active || disposed) { releaseProcessedImage(data); return }
    if (data.width * data.height > 64 * 1024 * 1024) { releaseProcessedImage(data); throw new Error($t('desktop.sourcePixelLimit')) }
    releaseProcessedImage(image_data.value)
    image_data.value = data; result.value = undefined; resize.value = 1
    updateSize()
    await refreshImage()
  } catch (error) { if (run === uploadEpoch && active) toast.error($t('desktop.imageFailed', {error: String(error)}), {timeout: 4000}) }
}
function updateSize() {
  if (!image_data.value) return
  const size = fitAspect(image_data.value.width, image_data.value.height, Math.max(1, image_data.value.width * resize.value), 'width')
  exportSettings.width = size.width; exportSettings.height = size.height
}
async function prepareExport() {
  if (!result.value || stale.value) await refreshImage()
  if (!result.value || stale.value || !active) throw new Error($t('desktop.mapExpired'))
  return {structure: result.value.structure, name: image_data.value?.name || 'map-art'}
}
async function exportImage() {
  if (exportImageLoading.value) return
  let task: AbortController | undefined
  try {
    await prepareExport()
    task = new AbortController(); imageController = task
    const current = result.value, name = image_data.value?.name || 'map-art'
    exportImageLoading.value = true
    const canvas = await mapTextureCanvas(current, task.signal)
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (task.signal.aborted || !active) return
      if (!blob) throw new Error($t('desktop.encodePng'))
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.download = name.replace(/[<>:"/\\|?*]/g, '_') + '-block-texture.png'; link.href = url; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } finally { canvas.width = canvas.height = 0 }
  } catch (error) { if (active && (error as Error).name !== 'AbortError') toast.error($t('desktop.imageExportFailed', {error: String(error)})) }
  finally { if (task && imageController === task) { imageController = undefined; exportImageLoading.value = false } }
}
function cleanImage() {
  ++uploadEpoch; cancelWork()
  releaseProcessedImage(image_data.value); image_data.value = undefined
  result.value = undefined; stale.value = false
  if (finallyImage.value) finallyImage.value.width = finallyImage.value.height = 0
  finallyImage.value = undefined
  if (previewCanvas.value) previewCanvas.value.width = previewCanvas.value.height = 0
}
onMounted(async () => {
  try {
    const data = await ensureMapArtData()
    if (disposed) return
    if (!selectedBlocks.value.length) selectedBlocks.value = (data.find(category => category.name === 'wool') ?? data[0])?.items.map(item => item.id) ?? []
    blocksLoaded.value = true
  } catch (error) { if (!disposed) toast.error($t('desktop.blocksFailed', {error: String(error)})) }
})
onActivated(() => { active = true })
onDeactivated(() => {
  active = false; ++uploadEpoch; cancelWork(); dialog.value = false; fullscreenDialog.value = false
})
onBeforeUnmount(() => { disposed = true; active = false; cleanImage() })
</script>

<template>
  <v-row no-gutters class="mx-auto v-theme--custom map-editor-row">
    <v-col cols="12" md="4" class="pa-4 d-flex flex-column text-medium-emphasis config-column">
      <div class="config-scroll">
      <v-row v-if="image_data != undefined">
        <v-col cols="12" class="image-column" >
          <v-img
              :aspect-ratio="16/9"
              :style="{
                  backgroundImage: `url(${image_data.objectUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundAttachment: 'fixed',
                  }"
              contain
              transition="fade-transition"
              class="image-preview rounded-lg"
          >
          </v-img>
          <v-list density="compact" >
            <v-list-item>
              <template #prepend>
                <v-icon>mdi-file</v-icon>
              </template>
              <v-list-item-title>{{$t('mapImage2d.fileName')}}</v-list-item-title>
              <v-list-item-subtitle>{{ `${image_data.name}.${image_data.ext}` }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon>mdi-arrow-expand</v-icon>
              </template>
              <v-list-item-title>{{$t('mapImage2d.resolution')}}</v-list-item-title>
              <v-list-item-subtitle>{{ `${image_data.width} x ${image_data.height}` }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-col>
        <v-col cols="12" class="d-flex align-center justify-center gap-2" style="padding: 0px !important;">
          <v-icon color="blue" icon="mdi-arrow-expand" class="mt-1"></v-icon>
          <v-btn-toggle
              v-model="resize"
              color="info"
              class="d-flex align-center"
              mandatory
              @update:model-value="updateSize"
          >
            <v-btn :value="1" size="large" class="px-6">
              <span class="font-weight-bold">1</span>
            </v-btn>
            <v-btn :value="1/2" size="large" class="px-6">
              <span class="font-weight-bold">1/2</span>
            </v-btn>
            <v-btn :value="1/4" size="large" class="px-6">
              <span class="font-weight-bold">1/4</span>
            </v-btn>
            <v-btn :value="1/8" size="large" class="px-6">
              <span class="font-weight-bold">1/8</span>
            </v-btn>
          </v-btn-toggle>
        </v-col>
        <v-col cols="12" class="d-flex align-center justify-center gap-2" style="padding: 6px !important;">
          <v-icon color="blue" icon="mdi-rotate-right"  class="mt-1"></v-icon>
          <v-btn-toggle
              v-model="exportSettings.targetRotation"
              color="info"
              mandatory
              class="d-flex align-center"
          >
            <v-btn :value="0" size="large" class="px-6">
              <span class="font-weight-bold">0</span>
            </v-btn>
            <v-btn :value="90" size="large" class="px-6">
              <span class="font-weight-bold">90</span>
            </v-btn>
            <v-btn :value="180" size="large" class="px-6">
              <span class="font-weight-bold">180</span>
            </v-btn>
            <v-btn :value="270" size="large" class="px-6">
              <span class="font-weight-bold">270</span>
            </v-btn>
          </v-btn-toggle>
        </v-col>
      </v-row>

      <div class="flex-grow-0">
        <v-file-input
            v-model="mapImg"
            accept="image/png, image/jpeg, image/bmp, image/jpg"
            :label="$t('mapImage2d.selectImageFile')"
            density="compact"
            prepend-icon="mdi-folder-open"
            @update:model-value="uploadImage(mapImg)"
            @click:clear="cleanImage"
            class="mb-4"
        ></v-file-input>
        <v-alert
            v-if="!mapImg"
            variant="tonal"
            color="info"
            icon="mdi-information"
            class="mb-4"
        >
          {{$t('mapImage2d.uploadImageTip')}}
        </v-alert>
      </div>

      <div class="flex-grow-1 overflow-y-auto">
        <v-text-field
            v-model.number="exportSettings.width"
            :label="$t('mapImage2d.exportWidth')"
            type="number"
            min="16"
            :max="exportSettings.maxResolution"
            step="16"
            :hint="$t('mapImage2d.suggestSameRatio')"
            persistent-hint
            density="compact"
            class="mb-2"
        >
        </v-text-field>

        <v-text-field
            v-model.number="exportSettings.height"
            :label="$t('mapImage2d.exportHeight')"
            type="number"
            min="16"
            :max="exportSettings.maxResolution"
            step="16"
            :hint="$t('mapImage2d.suggestSameRatio')"
            persistent-hint
            density="compact"
            class="mb-4"
        >
        </v-text-field>

        <v-select v-model="exportSettings.ditherMode" :items="[{title:'Floyd-Steinberg',value:'floyd'},{title:'Atkinson',value:'atkinson'},{title:$t('desktop.ordered'),value:'ordered'},{title:$t('desktop.noDither'),value:'none'}]" :label="$t('desktop.ditherMode')" density="compact"/>
        <v-slider v-model="exportSettings.adaptiveThreshold" :min="0" :max="1" :step="0.05" :label="$t('desktop.adaptive')" thumb-label/>
        <v-slider v-model="exportSettings.alphaThreshold" :min="0" :max="255" :step="1" :label="$t('desktop.alphaThreshold')" thumb-label/>
        <v-switch v-model="threeD" :label="$t('desktop.relief')" color="info" density="compact" hide-details/>
        <v-number-input v-model="maxZ" :min="1" :max="256" :disabled="!threeD" :label="$t('desktop.maxHeight')" :precision="0" density="compact"/>
        <v-select v-model="exportSettings.axios" :items="[{title:$t('desktop.horizontal'),value:'y'},{title:$t('desktop.verticalXY'),value:'z'},{title:$t('desktop.verticalZY'),value:'x'}]" :label="$t('desktop.orientation')" density="compact"/>
        <v-switch v-model="exportSettings.backing" :label="$t('desktop.backing')" color="info" density="compact" hide-details/>
        <v-select v-model="exportSettings.supportBlock"
          :items="[{title:$t('desktop.stone'),value:'minecraft:stone'},{title:$t('desktop.glass'),value:'minecraft:glass'},{title:$t('desktop.scaffolding'),value:'minecraft:scaffolding'}]" :label="$t('desktop.supportMaterial')" density="compact"/>
        <v-switch v-model="exportSettings.support" :label="$t('desktop.supportGround')" :disabled="exportSettings.supportBlock !== 'minecraft:scaffolding' || exportSettings.axios !== 'y'" color="info" density="compact" hide-details/>
        <p class="text-caption mb-3">{{ $t('desktop.mapNote') }}</p>
        <v-select
          v-model="exportSettings.matchMode"
          :items="[
            { title: $t('desktop.rgb'), value: 'rgb' },
            { title: $t('desktop.weighted'), value: 'weighted' },
            { title: 'Redmean', value: 'redmean' },
            { title: $t('desktop.oklab'), value: 'oklab' }
          ]"
          :label="$t('desktop.matchMode')"
          density="compact"
          class="mb-2"
        ></v-select>

        <v-slider
          v-model="exportSettings.brightness"
          :min="0.2"
          :max="2"
          :step="0.05"
          thumb-label
          :label="$t('desktop.brightness')"
          color="info"
          class="mb-1"
        ></v-slider>

        <v-slider
          v-model="exportSettings.contrast"
          :min="0.2"
          :max="2"
          :step="0.05"
          thumb-label
          :label="$t('desktop.contrast')"
          color="info"
          class="mb-1"
        ></v-slider>

        <v-slider
          v-model="exportSettings.saturation"
          :min="0"
          :max="2"
          :step="0.05"
          thumb-label
          :label="$t('desktop.saturation')"
          color="info"
          class="mb-1"
        ></v-slider>

        <v-slider
          v-model="exportSettings.gamma"
          :min="0.2"
          :max="3"
          :step="0.05"
          thumb-label
          label="Gamma"
          color="info"
          class="mb-1"
        ></v-slider>
      </div>
      <v-btn
          variant="outlined"
          block
          color="blue"
          @click="refreshImage"
          :disabled="!image_data || isProcessing"
      >
        <v-icon left>mdi-refresh</v-icon>
  {{$t('mapImage2d.refresh')}}
      </v-btn>

      <v-btn
          :disabled="!image_data || isProcessing"
          variant="outlined"
          block
          color="green"
          @click="dialog = true;"
      >
        <v-icon left>mdi-download</v-icon>
  {{$t('mapImage2d.exportSchematic')}}
      </v-btn>
      <v-btn
          :disabled="!image_data || isProcessing"
          variant="outlined"
          block
          color="green"
          :loading="exportImageLoading"
          @click="exportImage"
      >
        <v-icon left>mdi-download</v-icon>
  {{$t('mapImage2d.exportImage')}}
      </v-btn>
      <ToolPalettePicker v-if="blocksLoaded" v-model="selectedBlocks"/>
      </div>

    </v-col>

    <v-col cols="12" md="8" class="pa-4 d-flex flex-column preview-column">
      <div class="preview-scroll">
        <v-alert v-if="stale" type="warning" density="compact" variant="tonal" class="mb-2">{{ $t('desktop.mapStale') }}</v-alert>
        <div v-if="result" class="text-caption mb-2">{{ $t('desktop.mapSummary', {size: [result.width, result.height].join(' × '), count: result.structure.blockCount.toLocaleString(), dimensions: result.structure.size.join(' × ')}) }}</div>
      <div class="preview-container elevation-3 rounded-lg">
        <div v-if="isProcessing" class="processing-overlay">
          <v-progress-circular
              indeterminate
              size="64"
              color="info"
          ></v-progress-circular>
          <div class="text-caption mt-2">{{ $t('mapImage2d.processingImage') }} {{ progress }}%</div><v-btn @click="cancelWork" variant="text">{{ $t('desktop.cancelGeneration') }}</v-btn>
        </div>

        <div class="preview-content">
          <v-btn
              v-if="hasImage"
              size="small"
              variant="tonal"
              color="info"
              class="fullscreen-btn"
              @click="openFullscreen"
          >{{ $t('desktop.fullscreen') }}</v-btn>
          <canvas
              ref="previewCanvas"
              class="pixel-canvas"
              :style="{
              opacity: isProcessing ? 0.5 : 1,
              cursor: isProcessing ? 'wait' : 'default'
        }"
          ></canvas>
        </div>

        <div v-if="!hasImage"  class="d-flex align-center justify-center">
          <v-alert
              variant="tonal"
              color="grey"
              icon="mdi-image-off-outline"
              :text="$t('mapImage2d.waitingForImage')"
          ></v-alert>
        </div>
      </div>
      </div>

    </v-col>
  </v-row>
  <v-dialog v-model="fullscreenDialog" fullscreen>
    <v-card class="fullscreen-card">
      <v-toolbar density="compact">
        
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="resetFullscreenView">{{ $t('desktop.reset') }}</v-btn>
        <v-btn variant="text" @click="fullscreenDialog = false">{{ $t('desktop.close') }}</v-btn>
      </v-toolbar>
      <div
          class="fullscreen-stage"
          @wheel="onFullscreenWheel"
          @mousedown="onFullscreenMouseDown"
          @mousemove="onFullscreenMouseMove"
          @mouseup="onFullscreenMouseUp"
          @mouseleave="onFullscreenMouseUp"
      >
        <canvas
            ref="fullscreenCanvas"
            class="fullscreen-canvas"
            :style="fsCanvasStyle"
        ></canvas>
      </div>
    </v-card>
  </v-dialog>
  <GeneratedBlueprintExport v-if="dialog" :prepare="prepareExport" @close="cancelWork(); dialog = false"/>
</template>
<style scoped>
.map-editor-row {
  color: rgb(var(--v-theme-on-surface));
  height: calc(100vh - 64px);
}

.config-column,
.preview-column {
  height: 100%;
  overflow: hidden;
}

.config-scroll,
.preview-scroll {
  height: 100%;
  overflow-y: auto;
}

.block-selector-card {
  contain: layout paint;
}

.block-selector-card :deep(.v-list) {
  contain: content;
}

.block-item {
  content-visibility: auto;
  contain-intrinsic-size: 64px;
}

.preview-container {
  display: block;
  position: relative;
  min-height: 70vh;
  background: repeating-conic-gradient(#f5f5f5 0% 25%, white 0% 50%) 50% / 20px 20px;
}

.preview-content {
  position: relative;
}

.fullscreen-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
}

.processing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  z-index: 2;
}

.pixel-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  transition: opacity 0.3s ease;
}

.fullscreen-card {
  height: 100%;
}

.fullscreen-stage {
  height: calc(100% - 48px);
  background: #111;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-canvas {
  max-width: none;
  max-height: none;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  will-change: transform;
  user-select: none;
}
</style>
