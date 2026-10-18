<script setup lang="ts">
import {computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch} from 'vue'
import {useTheme} from 'vuetify'
import * as THREE from 'three'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import {runVoxelSurface} from '../../modules/toolbox/model-client'
import type {GeneratedStructure} from '../../modules/toolbox/types'

const props = defineProps<{
  model?: THREE.Object3D
  structure?: GeneratedStructure
  mode: 'source' | 'blocks'
  rotation: readonly number[]
}>()
const theme = useTheme()
const host = ref<HTMLDivElement>(), error = ref(''), building = ref(false)
const view = ref<'free' | 'front' | 'side' | 'top'>('free')
const hasContent = computed(() => props.mode === 'source' ? !!props.model : !!props.structure)
let active = true, mounted = false, disposed = false, epoch = 0, frame = 0, refreshFrame = 0
let renderer: THREE.WebGLRenderer | undefined, scene: THREE.Scene | undefined, camera: THREE.PerspectiveCamera | undefined
let controls: OrbitControls | undefined, observer: ResizeObserver | undefined, environment: THREE.WebGLRenderTarget | undefined
let root: THREE.Group | undefined, voxelMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | undefined
let surfaceTask: AbortController | undefined, radius = 1

function draw() {
  if (!active || frame || !renderer) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (active && renderer && scene && camera) renderer.render(scene, camera)
  })
}
function resize() {
  if (!renderer || !camera || !host.value) return
  const {width, height} = host.value.getBoundingClientRect()
  if (!width || !height) return
  const changed = camera.aspect !== width / height
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix()
  if (changed && root) fit(); else draw()
}
function fit() {
  if (!camera || !controls) return
  const vertical = THREE.MathUtils.degToRad(camera.fov) / 2
  const angle = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect))
  const distance = radius / Math.sin(angle) * 1.2
  const direction = view.value === 'front' ? [0,0,1] : view.value === 'side' ? [1,0,0] : view.value === 'top' ? [0,1,0] : [1,.7,1]
  camera.up.set(0, view.value === 'top' ? 0 : 1, view.value === 'top' ? -1 : 0)
  camera.position.fromArray(direction).normalize().multiplyScalar(distance)
  camera.near = Math.max(.001, radius / 1000); camera.far = Math.max(100, radius * 100)
  camera.updateProjectionMatrix(); controls.target.set(0,0,0); controls.update(); draw()
}
function clearContent() {
  if (root) { root.removeFromParent(); root.clear(); root = undefined }
  if (voxelMesh) { voxelMesh.geometry.dispose(); voxelMesh.material.dispose(); voxelMesh = undefined }
  // Source geometry/materials belong to the parent and survive cached route changes.
}
function ensureRenderer() {
  if (renderer || !host.value) return
  const next = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'})
  renderer = next
  next.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  next.outputColorSpace = THREE.SRGBColorSpace
  next.domElement.className = 'model-preview-canvas'
  next.domElement.setAttribute('aria-label', '可拖动旋转、滚轮缩放的模型预览')
  host.value.appendChild(next.domElement)
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(50,1,.01,10000)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 2.2))
  const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(5,8,6); scene.add(light)
  controls = new OrbitControls(camera, next.domElement)
  controls.enableDamping = false; controls.addEventListener('change', draw)
  observer = new ResizeObserver(resize); observer.observe(host.value)
  resize()
}
function releaseRenderer() {
  ++epoch; surfaceTask?.abort(); surfaceTask = undefined; building.value = false
  cancelAnimationFrame(frame); cancelAnimationFrame(refreshFrame); frame = refreshFrame = 0
  observer?.disconnect(); observer = undefined
  controls?.dispose(); controls = undefined
  clearContent(); environment?.dispose(); environment = undefined
  renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); renderer = undefined
  scene = undefined; camera = undefined
}
async function refresh() {
  if (!active || !mounted || disposed) return
  const run = ++epoch
  surfaceTask?.abort(); surfaceTask = undefined; building.value = false; error.value = ''
  clearContent()
  if (!hasContent.value) { releaseRenderer(); return }
  try {
    ensureRenderer()
    if (!scene) return
    const content = new THREE.Group()
    if (props.mode === 'source' && props.model) {
      let needsEnvironment = false
      props.model.traverse(child => {
        if (child instanceof THREE.Mesh && (Array.isArray(child.material) ? child.material : [child.material]).some(material => material instanceof THREE.MeshStandardMaterial)) needsEnvironment = true
      })
      // Lambert voxel previews and OBJ Phong materials do not consume a PBR
      // environment; avoid compiling a PMREM pipeline on every cached return.
      if (needsEnvironment && !environment) {
        const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer!)
        try { environment = pmrem.fromScene(room,.04); scene.environment = environment.texture }
        finally { room.dispose(); pmrem.dispose() }
      }
      const rotated = new THREE.Group()
      // Voxelizer applies X, then Y, then Z (Rz * Ry * Rx).
      rotated.rotation.set(...props.rotation.map(n => THREE.MathUtils.degToRad(Number.isFinite(n) ? n : 0)) as [number,number,number], 'ZYX')
      rotated.add(props.model); content.add(rotated)
    } else if (props.structure) {
      const task = new AbortController(); surfaceTask = task; building.value = true
      const surface = await runVoxelSurface(props.structure, task.signal)
      if (run !== epoch || !active || disposed) return
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions,3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(surface.normals,3))
      geometry.setAttribute('color', new THREE.BufferAttribute(surface.colors,3))
      voxelMesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({vertexColors:true}))
      content.add(voxelMesh)
    }
    const box = new THREE.Box3().setFromObject(content, true)
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
    if (![...center.toArray(), ...size.toArray()].every(Number.isFinite) || box.isEmpty()) throw new Error('模型没有可预览的表面。')
    content.position.copy(center).negate(); radius = Math.max(size.length() / 2, .01)
    root = content; scene.add(content); resize(); fit()
  } catch (reason) {
    if (run === epoch && active && (reason as Error).name !== 'AbortError') { error.value = String(reason); draw() }
  } finally { if (run === epoch) { surfaceTask = undefined; building.value = false } }
}
function scheduleRefresh() {
  if (!active || !mounted || disposed) return
  ++epoch; surfaceTask?.abort(); surfaceTask = undefined
  cancelAnimationFrame(refreshFrame)
  refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; void refresh() })
}
watch(() => [props.model, props.structure, props.mode], scheduleRefresh)
watch(() => props.rotation, () => { if (props.mode === 'source') scheduleRefresh() })
watch(() => theme.global.current.value.dark, draw)
watch(view, fit)
onMounted(() => { mounted = true; scheduleRefresh() })
onActivated(async () => { active = true; await nextTick(); scheduleRefresh() })
onDeactivated(() => { active = false; releaseRenderer() })
onBeforeUnmount(() => { disposed = true; active = false; releaseRenderer() })
</script>

<template>
  <section class="model-preview rounded-lg border" aria-label="模型预览区域">
    <div class="d-flex align-center flex-wrap ga-2 pa-2 preview-toolbar">
      <v-btn-toggle v-model="view" mandatory density="compact" variant="text" color="primary" aria-label="预览视角">
        <v-btn value="free">自由</v-btn><v-btn value="front">正面</v-btn><v-btn value="side">侧面</v-btn><v-btn value="top">俯视</v-btn>
      </v-btn-toggle>
      <v-spacer/><v-btn icon="mdi-fit-to-screen-outline" variant="text" size="small" aria-label="适应预览区域" @click="fit"/>
    </div>
    <div ref="host" class="model-preview-stage">
      <div v-if="!hasContent" class="preview-message text-medium-emphasis"><v-icon icon="mdi-cube-scan" size="48"/><p>{{ mode === 'source' ? '选择模型及附件后查看原始模型' : '生成后在这里查看方块效果' }}</p></div>
      <div v-if="building" class="preview-message"><v-progress-circular indeterminate color="primary"/><p>正在后台构建可见表面…</p></div>
      <div v-if="error" class="preview-message"><v-alert type="warning" variant="tonal">{{ error }}</v-alert></div>
    </div>
    <div class="text-caption text-medium-emphasis px-3 py-2">拖动旋转 · 滚轮缩放 · 仅绘制可见表面，导出保留完整方块</div>
  </section>
</template>

<style scoped>
.model-preview { overflow: hidden; background: rgb(var(--v-theme-surface)); }
.preview-toolbar { border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.model-preview-stage { position: relative; min-height: 340px; height: clamp(340px, 57vh, 720px); background: rgba(var(--v-theme-on-surface), .035); }
.model-preview-stage :deep(canvas) { width: 100%; height: 100%; display: block; touch-action: none; }
.preview-message { position: absolute; inset: 0; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 1; pointer-events: none; }
</style>
