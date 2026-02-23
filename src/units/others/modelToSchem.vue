<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch} from "vue";
import {useI18n} from "vue-i18n";
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {MTLLoader} from "three/examples/jsm/loaders/MTLLoader.js";
import {OBJLoader} from "three/examples/jsm/loaders/OBJLoader.js";
import {STLLoader} from "three/examples/jsm/loaders/STLLoader.js";
import {mapArtData} from "../../modules/map_art/map_art_data.ts";
import {createMapArt} from "../../modules/map_art/image_utils.ts";
import {BlockStatePos} from "../../modules/map_art/schematic_data.ts";
import {getBlockImg, toast} from "../../modules/others.ts";
import {
  adjustColor,
  colorDistance,
  composeDisplayColor,
  countTriangles,
  resolveTriangleMaterial,
  sampleTextureColor,
  suggestVoxelResolution,
} from "../../modules/threed_data/modelToSchem_render.ts";
import {ModelTextureResolver} from "../../modules/threed_data/modelToSchem_texture.ts";

const {t} = useI18n();

const VOXEL_RESOLUTION_MIN = 0;
const VOXEL_RESOLUTION_MAX = 2048;

const clampVoxelResolution = (value: number) => {
  const next = Number.isFinite(value) ? Math.round(value) : VOXEL_RESOLUTION_MIN;
  return Math.min(VOXEL_RESOLUTION_MAX, Math.max(VOXEL_RESOLUTION_MIN, next));
};

const modelFile = ref<File | undefined>();
const mtlFile = ref<File | undefined>();
const textureFiles = ref<File[]>([]);
const hasModel = ref(false);
const hasVoxelPreview = ref(false);
const loadingModel = ref(false);
const previewRefreshing = ref(false);
const exporting = ref(false);

const modelCanvas = ref<HTMLCanvasElement | null>(null);
const voxelCanvas = ref<HTMLCanvasElement | null>(null);
const viewMode = ref<'free' | 'front' | 'side' | 'top'>('free');
const exportFileName = ref('model_voxel');

const voxelStats = ref<{blocks: number, size: string} | null>(null);
const selectedBlocks = ref<string[]>([]);
const expandedCategories = ref<string[]>([]);
const autoVoxelResolution = ref(true);
const modelMetrics = ref<{maxDimension: number, triangles: number} | null>(null);

type VoxelizedBlock = { x: number; y: number; z: number; blockId: string };
let voxelPreviewData: {blocks: VoxelizedBlock[], size: {width: number, height: number, length: number}} | null = null;
const voxelSettingsVersion = ref(0);
const lastVoxelizedVersion = ref(-1);

const exportSettings = reactive({
  voxelResolution: 80,
  sampleDensity: 1.2,
  schematic_type: 2,
  sub_type: -1,
  matchMode: 'weighted' as 'rgb' | 'weighted' | 'redmean',
  brightness: 1,
  contrast: 1,
  saturation: 1,
  gamma: 1,
});

const selectableBlocks = computed(() => {
  if (!mapArtData.value) return [] as Array<{id: string, average_rgb: number[], zh_cn: string}>;
  if (selectedBlocks.value.length === 0) return mapArtData.value.flatMap(c => c.items);
  const selectedSet = new Set(selectedBlocks.value);
  return mapArtData.value.flatMap(c => c.items.filter(item => selectedSet.has(item.id)));
});

const toggleBlock = (blockId: string) => {
  const index = selectedBlocks.value.indexOf(blockId);
  if (index === -1) selectedBlocks.value.push(blockId);
  else selectedBlocks.value.splice(index, 1);
};

const toggleCategory = (categoryName: string) => {
  if (!mapArtData.value) return;
  const category = mapArtData.value.find(c => c.name === categoryName);
  if (!category) return;

  const allSelected = category.items.every(item => selectedBlocks.value.includes(item.id));
  if (allSelected) {
    selectedBlocks.value = selectedBlocks.value.filter(id => !category.items.some(item => item.id === id));
  } else {
    const toAdd = category.items.filter(item => !selectedBlocks.value.includes(item.id)).map(item => item.id);
    selectedBlocks.value = [...selectedBlocks.value, ...toAdd];
  }
};

const isCategorySelected = (categoryName: string) => {
  if (!mapArtData.value) return false;
  const category = mapArtData.value.find(c => c.name === categoryName);
  return category?.items.every(item => selectedBlocks.value.includes(item.id)) ?? false;
};

const schematicTypes = [
  {
    value: 1,
    label: '香草结构',
    subtypes: [
      { value: -1, label: '默认格式' }
    ]
  },
  {
    value: 2,
    label: '投影结构',
    subtypes: [
      { value: -1, label: '默认格式' }
    ]
  },
  {
    value: 3,
    label: '创世神',
    subtypes: [
      { value: 0, label: '1.20+' },
      { value: 1, label: '1.16+' }
    ]
  },
  {
    value: 4,
    label: '建筑小帮手',
    subtypes: [
      { value: 0, label: '1.20+' },
      { value: 1, label: '1.16+' },
      { value: 2, label: '1.12+' }
    ]
  },
  {
    value: 5,
    label: 'MC BE',
    subtypes: [
      { value: -1, label: '默认格式' },
    ]
  }
];

const currentSubTypes = computed(() => {
  const mainType = schematicTypes.find(item => item.value === exportSettings.schematic_type);
  return mainType?.subtypes || [];
});

const getFileExt = (file: File | undefined) => file?.name.split('.').pop()?.toLowerCase() || '';
const isObjModel = computed(() => getFileExt(modelFile.value) === 'obj');
const textureResolver = new ModelTextureResolver();
const nearestBlockCache = new Map<number, string | null>();

watch(() => exportSettings.schematic_type, () => {
  const subTypes = currentSubTypes.value;
  if (!subTypes.some(item => item.value === exportSettings.sub_type)) {
    exportSettings.sub_type = subTypes[0]?.value ?? -1;
  }
});

let modelRenderer: THREE.WebGLRenderer | null = null;
let modelScene: THREE.Scene | null = null;
let modelCamera: THREE.PerspectiveCamera | null = null;
let modelControls: OrbitControls | null = null;
let modelRoot: THREE.Object3D | null = null;
let modelBaseDistance = 5;
let detachModelControlRender: (() => void) | null = null;

let voxelRenderer: THREE.WebGLRenderer | null = null;
let voxelScene: THREE.Scene | null = null;
let voxelCamera: THREE.PerspectiveCamera | null = null;
let voxelControls: OrbitControls | null = null;
let voxelRoot: THREE.Object3D | null = null;
let voxelBaseDistance = 5;
let detachVoxelControlRender: (() => void) | null = null;

const findNearestBlockId = (r: number, g: number, b: number) => {
  if (selectableBlocks.value.length === 0) return null;
  const cacheKey = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  if (nearestBlockCache.has(cacheKey)) return nearestBlockCache.get(cacheKey) ?? null;

  const adjusted = adjustColor(r, g, b, {
    brightness: exportSettings.brightness,
    contrast: exportSettings.contrast,
    saturation: exportSettings.saturation,
    gamma: exportSettings.gamma,
  });
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const item of selectableBlocks.value) {
    const distance = colorDistance(
      adjusted.r,
      adjusted.g,
      adjusted.b,
      item.average_rgb[0],
      item.average_rgb[1],
      item.average_rgb[2],
      exportSettings.matchMode,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = item.id;
    }
  }
  nearestBlockCache.set(cacheKey, bestId);
  return bestId;
};

const initRendererScene = (canvas: HTMLCanvasElement, background = 0xf5f5f5) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1, 3000);
  camera.position.set(5, 4, 5);

  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600, false);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const directional = new THREE.DirectionalLight(0xffffff, 1.25);
  directional.position.set(3, 5, 2);
  scene.add(directional);
  scene.add(new THREE.GridHelper(10, 10, 0x999999, 0xcccccc));

  return {scene, camera, renderer, controls};
};

const fitCameraToObject = (camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D) => {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);

  object.position.sub(center);

  const fov = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.8;
  const baseDistance = Math.max(distance, 3);

  camera.near = 0.01;
  camera.far = baseDistance * 30;
  camera.position.set(baseDistance, baseDistance * 0.8, baseDistance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.update();
  return baseDistance;
};

const switchViewFor = (mode: 'free' | 'front' | 'side' | 'top', camera: THREE.PerspectiveCamera, controls: OrbitControls, baseDistance: number) => {
  if (mode === 'free') return;
  if (mode === 'front') camera.position.set(0, 0, baseDistance);
  if (mode === 'side') camera.position.set(baseDistance, 0, 0);
  if (mode === 'top') camera.position.set(0, baseDistance, 0.001);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
};

const switchView = (mode: 'free' | 'front' | 'side' | 'top') => {
  viewMode.value = mode;
  if (modelCamera && modelControls) switchViewFor(mode, modelCamera, modelControls, modelBaseDistance);
  if (voxelCamera && voxelControls) switchViewFor(mode, voxelCamera, voxelControls, voxelBaseDistance);
  renderModelOnce();
  renderVoxelOnce();
};

const renderModelOnce = () => {
  if (!modelRenderer || !modelScene || !modelCamera) return;
  modelRenderer.render(modelScene, modelCamera);
};

const renderVoxelOnce = () => {
  if (!voxelRenderer || !voxelScene || !voxelCamera) return;
  voxelRenderer.render(voxelScene, voxelCamera);
};

const bindControlRender = (controls: OrbitControls | null, render: () => void) => {
  if (!controls) return null;
  controls.addEventListener('change', render);
  return () => controls.removeEventListener('change', render);
};

const applyFlatMaterial = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.material) {
      mesh.material = new THREE.MeshStandardMaterial({color: 0xc8c8c8});
    }
  });
};

const disposeObjectTree = (root: THREE.Object3D | null, scene: THREE.Scene | null) => {
  if (!root || !scene) return;
  scene.remove(root);
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
    else mesh.material?.dispose();
  });
};


const loadModel = async (file: File | undefined) => {
  if (!file || !modelScene) return;
  loadingModel.value = true;
  try {
    const ext = getFileExt(file);
    const arrayBuffer = await file.arrayBuffer();
    let object: THREE.Object3D;

    if (ext === 'gltf' || ext === 'glb') {
      object = await new Promise<THREE.Object3D>((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.parse(arrayBuffer, '', (gltf) => resolve(gltf.scene), (err) => reject(err));
      });
    } else if (ext === 'stl') {
      const geometry = new STLLoader().parse(arrayBuffer);
      geometry.computeVertexNormals();
      object = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({color: 0xc8c8c8, roughness: 0.9, metalness: 0})
      );
    } else if (ext === 'obj') {
      const objText = new TextDecoder().decode(arrayBuffer);
      const loader = new OBJLoader();
      if (mtlFile.value) {
        const manager = new THREE.LoadingManager();
        textureResolver.update(textureFiles.value);
        manager.setURLModifier((url) => textureResolver.resolve(url));
        const mtlText = await mtlFile.value.text();
        const materials = new MTLLoader(manager).parse(mtlText, '');
        materials.preload();
        loader.setMaterials(materials);
      } else {
        textureResolver.clear();
      }
      object = loader.parse(objText);
    } else {
      throw new Error(t('others.modelToSCHEM.unsupportedFormat'));
    }

    disposeObjectTree(modelRoot, modelScene);
    modelRoot = null;
    applyFlatMaterial(object);
    modelRoot = object;
    modelScene.add(modelRoot);
    modelBaseDistance = fitCameraToObject(modelCamera!, modelControls!, modelRoot);
    renderModelOnce();

    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const triangles = countTriangles(modelRoot);
    modelMetrics.value = {maxDimension, triangles};
    if (autoVoxelResolution.value) {
      exportSettings.voxelResolution = clampVoxelResolution(suggestVoxelResolution(maxDimension, triangles));
    }

    hasModel.value = true;
    hasVoxelPreview.value = false;
    voxelPreviewData = null;
    voxelStats.value = null;
    disposeObjectTree(voxelRoot, voxelScene);
    voxelRoot = null;

    exportFileName.value = `${file.name.replace(/\.[^/.]+$/, '')}_voxel`;
  } catch (error) {
    toast.error(t('others.modelToSCHEM.loadError', {error: String(error)}), {timeout: 3000});
    hasModel.value = false;
  } finally {
    loadingModel.value = false;
  }
};

watch(modelFile, async file => {
  if (getFileExt(file) !== 'obj') {
    mtlFile.value = undefined;
    textureFiles.value = [];
    textureResolver.clear();
  }
  await loadModel(file);
});

watch(mtlFile, async () => {
  if (!isObjModel.value || !modelFile.value) return;
  await loadModel(modelFile.value);
});

watch(textureFiles, async () => {
  if (!isObjModel.value || !modelFile.value || !mtlFile.value) return;
  await loadModel(modelFile.value);
});

watch(autoVoxelResolution, enabled => {
  if (!enabled || !modelMetrics.value) return;
  exportSettings.voxelResolution = clampVoxelResolution(
    suggestVoxelResolution(modelMetrics.value.maxDimension, modelMetrics.value.triangles)
  );
});

watch(() => exportSettings.voxelResolution, (value) => {
  const clamped = clampVoxelResolution(value);
  if (clamped !== value) exportSettings.voxelResolution = clamped;
});

const invalidateVoxelPreview = () => {
  voxelPreviewData = null;
  hasVoxelPreview.value = false;
  voxelStats.value = null;
  lastVoxelizedVersion.value = -1;
  voxelSettingsVersion.value += 1;
};

watch(
  [
    () => exportSettings.voxelResolution,
    () => exportSettings.sampleDensity,
    () => exportSettings.matchMode,
    () => exportSettings.brightness,
    () => exportSettings.contrast,
    () => exportSettings.saturation,
    () => exportSettings.gamma,
    selectedBlocks,
  ],
  () => {
    invalidateVoxelPreview();
  },
  {deep: true},
);

watch(
  [
    selectedBlocks,
    () => exportSettings.matchMode,
    () => exportSettings.brightness,
    () => exportSettings.contrast,
    () => exportSettings.saturation,
    () => exportSettings.gamma,
  ],
  () => {
    nearestBlockCache.clear();
  },
  {deep: true},
);

watch(mapArtData, (data) => {
  if (!data || data.length === 0) return;
  if (selectedBlocks.value.length === 0) {
    const wool = data.find(c => c.name === 'wool');
    selectedBlocks.value = wool ? wool.items.map(item => item.id) : data[0].items.map(item => item.id);
  }
}, {immediate: true});

const toVoxelCoord = (v: THREE.Vector3, min: THREE.Vector3, scale: number) => ({
  x: Math.max(0, Math.round((v.x - min.x) * scale)),
  y: Math.max(0, Math.round((v.y - min.y) * scale)),
  z: Math.max(0, Math.round((v.z - min.z) * scale)),
});

const encodeVoxelKey = (x: number, y: number, z: number) => (x << 20) | (y << 10) | z;

const addColorSample = (
  sampleMap: Map<number, {r: number, g: number, b: number, c: number}>,
  key: number,
  r: number,
  g: number,
  b: number,
) => {
  const current = sampleMap.get(key);
  if (!current) {
    sampleMap.set(key, {r, g, b, c: 1});
    return;
  }
  current.r += r;
  current.g += g;
  current.b += b;
  current.c += 1;
};

const yieldToMainThread = () => new Promise<void>((resolve) => {
  setTimeout(resolve, 0);
});

async function voxelizeSurface(): Promise<{blocks: VoxelizedBlock[], size: {width: number, height: number, length: number}}> {
  if (!modelRoot) throw new Error(t('others.modelToSCHEM.noModel'));

  const worldBox = new THREE.Box3().setFromObject(modelRoot);
  const boxSize = worldBox.getSize(new THREE.Vector3());
  const maxDimension = Math.max(boxSize.x, boxSize.y, boxSize.z, 1e-6);
  const targetResolution = clampVoxelResolution(exportSettings.voxelResolution);
  const scale = Math.max(1e-6, (targetResolution - 1) / maxDimension);
  const safeGrid = 1023;

  const sampleMap = new Map<number, {r: number, g: number, b: number, c: number}>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const edgeCross = new THREE.Vector3();

  const triangles = modelMetrics.value?.triangles || countTriangles(modelRoot);
  const densityScale = triangles > 280000 ? 0.35 : triangles > 160000 ? 0.5 : triangles > 90000 ? 0.7 : 1;
  const maxSteps = triangles > 280000 ? 8 : triangles > 160000 ? 10 : triangles > 90000 ? 14 : 20;
  let processedTriangles = 0;

  modelRoot.updateWorldMatrix(true, true);

  const meshes: THREE.Mesh[] = [];
  modelRoot.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });

  for (const mesh of meshes) {

    const geometry = mesh.geometry as THREE.BufferGeometry;
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!positionAttr) return;

    const indexAttr = geometry.getIndex();
    const uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    const triangleCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(positionAttr.count / 3);

    for (let tri = 0; tri < triangleCount; tri++) {
      const i0 = indexAttr ? indexAttr.getX(tri * 3) : tri * 3;
      const i1 = indexAttr ? indexAttr.getX(tri * 3 + 1) : tri * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(tri * 3 + 2) : tri * 3 + 2;

      a.fromBufferAttribute(positionAttr, i0);
      b.fromBufferAttribute(positionAttr, i1);
      c.fromBufferAttribute(positionAttr, i2);
      va.copy(a).applyMatrix4(mesh.matrixWorld);
      vb.copy(b).applyMatrix4(mesh.matrixWorld);
      vc.copy(c).applyMatrix4(mesh.matrixWorld);

      const v0 = toVoxelCoord(va, worldBox.min, scale);
      const v1 = toVoxelCoord(vb, worldBox.min, scale);
      const v2 = toVoxelCoord(vc, worldBox.min, scale);

      let uv0: {x: number, y: number} | null = null;
      let uv1: {x: number, y: number} | null = null;
      let uv2: {x: number, y: number} | null = null;
      if (uvAttr) {
        uv0 = {x: uvAttr.getX(i0), y: uvAttr.getY(i0)};
        uv1 = {x: uvAttr.getX(i1), y: uvAttr.getY(i1)};
        uv2 = {x: uvAttr.getX(i2), y: uvAttr.getY(i2)};
      }

      let vc0: {x: number, y: number, z: number} | null = null;
      let vc1: {x: number, y: number, z: number} | null = null;
      let vc2: {x: number, y: number, z: number} | null = null;
      if (colorAttr) {
        vc0 = {x: colorAttr.getX(i0), y: colorAttr.getY(i0), z: colorAttr.getZ(i0)};
        vc1 = {x: colorAttr.getX(i1), y: colorAttr.getY(i1), z: colorAttr.getZ(i1)};
        vc2 = {x: colorAttr.getX(i2), y: colorAttr.getY(i2), z: colorAttr.getZ(i2)};
      }

      const triMaterial = resolveTriangleMaterial(mesh, tri, indexAttr as any);
      const baseColor = triMaterial?.color?.isColor ? triMaterial.color as THREE.Color : new THREE.Color(0.8, 0.8, 0.8);

      edge1.set(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z);
      edge2.set(v2.x - v0.x, v2.y - v0.y, v2.z - v0.z);
      const area = edgeCross.copy(edge1).cross(edge2).length() * 0.5;
      const baseSteps = Math.max(1, Math.ceil(Math.sqrt(area) * exportSettings.sampleDensity * densityScale));
      const steps = Math.min(maxSteps, baseSteps);

      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
          const u = i / steps;
          const v = j / steps;
          const w = 1 - u - v;

          p.set(
            v0.x * w + v1.x * u + v2.x * v,
            v0.y * w + v1.y * u + v2.y * v,
            v0.z * w + v1.z * u + v2.z * v,
          );

          let sampled: {r: number, g: number, b: number} | null = null;

          if (uv0 && uv1 && uv2 && triMaterial?.map) {
            const uu = uv0.x * w + uv1.x * u + uv2.x * v;
            const vv = uv0.y * w + uv1.y * u + uv2.y * v;
            sampled = sampleTextureColor(triMaterial.map, uu, vv);
          }

          const vertexColorLinear = (vc0 && vc1 && vc2)
            ? {
                r: vc0.x * w + vc1.x * u + vc2.x * v,
                g: vc0.y * w + vc1.y * u + vc2.y * v,
                b: vc0.z * w + vc1.z * u + vc2.z * v,
              }
            : null;

          const mixed = composeDisplayColor(baseColor, sampled, vertexColorLinear);
          const rr = mixed.r;
          const gg = mixed.g;
          const bb = mixed.b;

          const x = Math.min(safeGrid, Math.max(0, Math.round(p.x)));
          const y = Math.min(safeGrid, Math.max(0, Math.round(p.y)));
          const z = Math.min(safeGrid, Math.max(0, Math.round(p.z)));
          const key = encodeVoxelKey(x, y, z);
          addColorSample(sampleMap, key, rr, gg, bb);
        }
      }

      processedTriangles += 1;
      if (processedTriangles % 500 === 0) {
        await yieldToMainThread();
      }
    }
  }

  const blocks: VoxelizedBlock[] = [];
  let maxX = 0, maxY = 0, maxZ = 0;
  for (const [key, sample] of sampleMap) {
    const rr = Math.round(sample.r / sample.c);
    const gg = Math.round(sample.g / sample.c);
    const bb = Math.round(sample.b / sample.c);
    const selectedId = findNearestBlockId(rr, gg, bb);
    if (!selectedId) continue;

    const x = (key >> 20) & 1023;
    const y = (key >> 10) & 1023;
    const z = key & 1023;
    blocks.push({x, y, z, blockId: selectedId});
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return { blocks, size: {width: maxX + 1, height: maxY + 1, length: maxZ + 1} };
}

const renderVoxelPreview = (voxelized: {blocks: VoxelizedBlock[], size: {width: number, height: number, length: number}}) => {
  if (!voxelScene) return;
  disposeObjectTree(voxelRoot, voxelScene);
  voxelRoot = null;

  const root = new THREE.Group();
  const colorCache = new Map<string, THREE.Color>();
  for (const category of mapArtData.value || []) {
    for (const item of category.items) {
      colorCache.set(item.id, new THREE.Color(item.average_rgb[0] / 255, item.average_rgb[1] / 255, item.average_rgb[2] / 255));
    }
  }

  const grouped = new Map<string, VoxelizedBlock[]>();
  for (const block of voxelized.blocks) {
    if (!grouped.has(block.blockId)) grouped.set(block.blockId, []);
    grouped.get(block.blockId)!.push(block);
  }

  const halfX = voxelized.size.width / 2;
  const halfY = voxelized.size.height / 2;
  const halfZ = voxelized.size.length / 2;

  for (const [blockId, blocks] of grouped) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: colorCache.get(blockId) || new THREE.Color(0.8, 0.8, 0.8),
      roughness: 0.9,
      metalness: 0,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
    const matrix = new THREE.Matrix4();
    let idx = 0;
    for (const block of blocks) {
      matrix.setPosition(block.x - halfX, block.y - halfY, block.z - halfZ);
      mesh.setMatrixAt(idx++, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }

  voxelRoot = root;
  voxelScene.add(root);
  voxelBaseDistance = fitCameraToObject(voxelCamera!, voxelControls!, root);
  switchView(viewMode.value);
  hasVoxelPreview.value = true;
  renderVoxelOnce();
};

const refreshVoxelPreview = async () => {
  if (!hasModel.value) {
    toast.error(t('others.modelToSCHEM.noModel'), {timeout: 3000});
    return;
  }
  if (selectableBlocks.value.length === 0) {
    toast.error(t('others.modelToSCHEM.noSelectedBlocks'), {timeout: 3000});
    return;
  }

  try {
    previewRefreshing.value = true;
    const voxelized = await voxelizeSurface();
    voxelPreviewData = voxelized;
    lastVoxelizedVersion.value = voxelSettingsVersion.value;
    renderVoxelPreview(voxelized);
    voxelStats.value = {
      blocks: voxelized.blocks.length,
      size: `${voxelized.size.width} × ${voxelized.size.height} × ${voxelized.size.length}`
    };
  } catch (error) {
    toast.error(t('toolsThreeD.modelMapArtExportError', {error: String(error)}), {timeout: 3000});
  } finally {
    previewRefreshing.value = false;
  }
};

const exportModelToBlueprint = async () => {
  if (!hasModel.value) {
    toast.error(t('others.modelToSCHEM.noModel'), {timeout: 3000});
    return;
  }
  if (!mapArtData.value || mapArtData.value.length === 0) {
    toast.error(t('toolsThreeD.modelMapArtColorTableMissing'), {timeout: 3000});
    return;
  }
  if (selectableBlocks.value.length === 0) {
    toast.error(t('others.modelToSCHEM.noSelectedBlocks'), {timeout: 3000});
    return;
  }

  try {
    exporting.value = true;
    if (!voxelPreviewData || lastVoxelizedVersion.value !== voxelSettingsVersion.value) {
      await refreshVoxelPreview();
    }
    if (!voxelPreviewData) throw new Error(t('others.modelToSCHEM.noVoxelResult'));

    const blocks: BlockStatePos[] = voxelPreviewData.blocks.map(block => ({
      pos: {x: block.x, y: block.y, z: block.z},
      block: {id: {name: `minecraft:${block.blockId}`}, properties: {}}
    }));

    const result = await createMapArt(
      blocks,
      exportFileName.value || 'model_voxel',
      voxelPreviewData.size,
      exportSettings.schematic_type,
      exportSettings.sub_type
    );

    if (result) toast.success(t('toolsThreeD.modelMapArtExportSuccess'), {timeout: 3000});
  } catch (error) {
    toast.error(t('toolsThreeD.modelMapArtExportError', {error: String(error)}), {timeout: 3000});
  } finally {
    exporting.value = false;
  }
};

const resizeRenderer = (canvasRef: HTMLCanvasElement | null, renderer: THREE.WebGLRenderer | null, camera: THREE.PerspectiveCamera | null) => {
  if (!canvasRef || !renderer || !camera) return;
  const w = canvasRef.clientWidth || 800;
  const h = canvasRef.clientHeight || 600;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
};

const onResize = () => {
  resizeRenderer(modelCanvas.value, modelRenderer, modelCamera);
  resizeRenderer(voxelCanvas.value, voxelRenderer, voxelCamera);
  renderModelOnce();
  renderVoxelOnce();
};

watch(hasModel, async (value) => {
  if (!value) return;
  await nextTick();
  onResize();
});

onMounted(() => {
  if (modelCanvas.value) {
    const s = initRendererScene(modelCanvas.value, 0xfafafa);
    modelScene = s.scene;
    modelCamera = s.camera;
    modelRenderer = s.renderer;
    modelControls = s.controls;
    detachModelControlRender = bindControlRender(modelControls, renderModelOnce);
    renderModelOnce();
  }
  if (voxelCanvas.value) {
    const s = initRendererScene(voxelCanvas.value, 0xf5f5f5);
    voxelScene = s.scene;
    voxelCamera = s.camera;
    voxelRenderer = s.renderer;
    voxelControls = s.controls;
    detachVoxelControlRender = bindControlRender(voxelControls, renderVoxelOnce);
    renderVoxelOnce();
  }

  window.addEventListener('resize', onResize);
  onResize();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  detachModelControlRender?.();
  detachVoxelControlRender?.();
  textureResolver.clear();

  disposeObjectTree(modelRoot, modelScene);
  disposeObjectTree(voxelRoot, voxelScene);

  modelControls?.dispose();
  voxelControls?.dispose();
  modelRenderer?.dispose();
  voxelRenderer?.dispose();
});
</script>

<template>
  <v-row no-gutters class="mx-auto v-theme--custom text-primary map-editor-row">
    <v-col cols="12" md="4" class="pa-4 d-flex flex-column text-medium-emphasis config-column">
      <div class="config-scroll">
        <v-file-input
          v-model="modelFile"
          accept=".obj,.gltf,.glb,.stl,model/obj,model/gltf-binary,model/gltf+json,model/stl"
          :label="t('others.modelToSCHEM.selectModelFile')"
          density="compact"
          prepend-icon="mdi-cube-scan"
          class="mb-3"
        ></v-file-input>

        <v-file-input
          v-if="isObjModel"
          v-model="mtlFile"
          accept=".mtl,text/plain"
          :label="t('others.modelToSCHEM.mtlFileOptional')"
          density="compact"
          prepend-icon="mdi-palette"
          class="mb-3"
        ></v-file-input>

        <v-file-input
          v-if="isObjModel"
          v-model="textureFiles"
          accept="image/*"
          multiple
          chips
          :label="t('others.modelToSCHEM.textureFilesOptional')"
          density="compact"
          prepend-icon="mdi-image-multiple"
          class="mb-3"
        ></v-file-input>

        <v-card v-show="hasModel" class="mb-3 model-preview-card elevation-3 rounded-lg">
          <div class="preview-title">{{ t('others.modelToSCHEM.modelPreviewTitle') }}</div>
          <canvas ref="modelCanvas" class="model-preview-canvas"></canvas>
        </v-card>

        <v-text-field v-model="exportFileName" :label="t('others.modelToSCHEM.exportName')" density="compact" class="mb-2"></v-text-field>

        <v-text-field
          v-model.number="exportSettings.voxelResolution"
          type="number"
          :label="t('others.modelToSCHEM.voxelResolution')"
          :min="VOXEL_RESOLUTION_MIN"
          :max="VOXEL_RESOLUTION_MAX"
          :disabled="autoVoxelResolution"
          density="compact"
          class="mb-2"
        ></v-text-field>

        <v-switch
            v-model="autoVoxelResolution"
            :label="t('others.modelToSCHEM.autoVoxelResolution')"
            color="info"
            density="compact"
            hide-details
            class="ml-4"
            >
        </v-switch>

        <v-alert v-if="autoVoxelResolution" variant="tonal" color="info" class="mb-2 text-caption">
          {{ t('others.modelToSCHEM.voxelAutoHint') }}
        </v-alert>

        <v-alert v-if="modelMetrics" variant="tonal" color="info" class="mb-2 text-caption">
          {{ t('others.modelToSCHEM.modelMetrics', { size: modelMetrics.maxDimension.toFixed(2), triangles: modelMetrics.triangles }) }}
        </v-alert>

        <v-slider
          v-model="exportSettings.sampleDensity"
          :label="t('others.modelToSCHEM.sampleDensity')"
          :min="0.6"
          :max="2.4"
          :step="0.1"
          thumb-label
          color="info"
          class="mb-2"
        ></v-slider>

        <v-btn-toggle v-model="viewMode" mandatory color="primary" density="compact" class="mb-3" @update:model-value="switchView">
          <v-btn value="free">{{ t('toolsThreeD.freeView') }}</v-btn>
          <v-btn value="front">{{ t('toolsThreeD.frontView') }}</v-btn>
          <v-btn value="side">{{ t('toolsThreeD.sideView') }}</v-btn>
          <v-btn value="top">{{ t('toolsThreeD.topView') }}</v-btn>
        </v-btn-toggle>

        <v-select v-model="exportSettings.schematic_type" :items="schematicTypes" item-title="label" item-value="value" :label="t('toolsThreeD.mainType')" density="compact" class="mb-2" />
        <v-select v-model="exportSettings.sub_type" :items="currentSubTypes" item-title="label" item-value="value" :label="t('toolsThreeD.subType')" density="compact" class="mb-2" />

        <v-select
          v-model="exportSettings.matchMode"
          :items="[
            { title: t('others.modelToSCHEM.matchModeRgb'), value: 'rgb' },
            { title: t('others.modelToSCHEM.matchModeWeighted'), value: 'weighted' },
            { title: t('others.modelToSCHEM.matchModeRedmean'), value: 'redmean' }
          ]"
          :label="t('others.modelToSCHEM.colorMatch')"
          density="compact"
          class="mb-2"
        ></v-select>

        <v-slider v-model="exportSettings.brightness" :min="0.5" :max="1.5" :step="0.05" thumb-label :label="t('others.modelToSCHEM.brightness')" color="info" class="mb-1" />
        <v-slider v-model="exportSettings.contrast" :min="0.5" :max="1.5" :step="0.05" thumb-label :label="t('others.modelToSCHEM.contrast')" color="info" class="mb-1" />
        <v-slider v-model="exportSettings.saturation" :min="0.5" :max="1.5" :step="0.05" thumb-label :label="t('others.modelToSCHEM.saturation')" color="info" class="mb-1" />
        <v-slider v-model="exportSettings.gamma" :min="0.6" :max="1.8" :step="0.05" thumb-label label="Gamma" color="info" class="mb-2" />

        <v-btn variant="outlined" block color="blue" :loading="previewRefreshing" :disabled="!hasModel || loadingModel" class="mb-2" @click="refreshVoxelPreview">
          <v-icon left>mdi-refresh</v-icon>
          {{ t('mapImage2d.refresh') }}
        </v-btn>

        <v-alert v-if="voxelStats" variant="tonal" color="success" class="mb-2">
          {{ t('others.modelToSCHEM.voxelResult', voxelStats) }}
        </v-alert>

        <v-card v-if="mapArtData" class="mb-2">
          <v-toolbar density="compact">
            <v-toolbar-title>{{ t('mapImage2d.blockSelector') }} ({{ selectedBlocks.length }})</v-toolbar-title>
          </v-toolbar>
          <v-list>
            <v-list-group v-for="category in mapArtData" :key="category.name" v-model="expandedCategories" :value="category.name">
              <template #activator="{ props }">
                <v-list-item v-bind="props" :title="category.zh_cn">
                  <template #prepend>
                    <v-checkbox :model-value="isCategorySelected(category.name)" color="info" hide-details @click.stop="toggleCategory(category.name)"></v-checkbox>
                    <v-icon icon="mdi-cube-scan"></v-icon>
                  </template>
                </v-list-item>
              </template>

              <v-list-item v-for="block in category.items" :key="block.id" @click="toggleBlock(block.id)" style="padding-inline-start: 0 !important;">
                <template #prepend>
                  <v-checkbox :model-value="selectedBlocks.includes(block.id)" color="info" hide-details></v-checkbox>
                </template>
                <v-row align="start" no-gutters>
                  <v-col cols="2" class="d-flex justify-center mt-2">
                    <v-avatar size="28" rounded="0" class="mr-2" style="border: 1px solid rgba(0,0,0,0.1)">
                      <v-img :src="getBlockImg(block.id)" :lazy-src="getBlockImg(block.id)" :alt="block.id" style="width: 100%; height: 100%; object-fit: contain; image-rendering: crisp-edges;" />
                    </v-avatar>
                  </v-col>
                  <v-col cols="6">
                    <div class="text-body-2 font-weight-bold">{{ block.zh_cn }}</div>
                    <div class="text-caption text-grey">{{ block.id }}</div>
                  </v-col>
                  <v-col cols="4">
                    <v-chip class="ma-1" label size="small">
                      <v-avatar :color="block.average_rgb_hex" size="16" class="mr-1"></v-avatar>
                      <span>{{ block.average_rgb_hex }}</span>
                    </v-chip>
                  </v-col>
                </v-row>
              </v-list-item>
            </v-list-group>
          </v-list>
        </v-card>

        <v-btn color="primary" block prepend-icon="mdi-export" :loading="exporting" :disabled="!hasModel || loadingModel" @click="exportModelToBlueprint">
          {{ t('toolsThreeD.ModelToSchem') }}
        </v-btn>
      </div>
    </v-col>

    <v-col cols="12" md="8" class="pa-4 d-flex flex-column preview-column">
      <div class="preview-scroll">
        <div class="preview-voxel-card elevation-3 rounded-lg">
          <div class="preview-title">{{ t('others.modelToSCHEM.voxelPreviewTitle') }}</div>
          <div v-if="loadingModel || previewRefreshing" class="processing-overlay">
            <v-progress-circular indeterminate size="64" color="info"></v-progress-circular>
            <div class="text-caption mt-2">{{ t('others.modelToSCHEM.loadingModel') }}</div>
          </div>
          <canvas ref="voxelCanvas" class="voxel-canvas"></canvas>
          <div v-if="!hasVoxelPreview" class="empty-tip">
            <v-alert variant="tonal" color="grey" icon="mdi-cube-outline" :text="t('others.modelToSCHEM.refreshToPreview')"></v-alert>
          </div>
        </div>
      </div>
    </v-col>
  </v-row>
</template>

<style scoped>
.map-editor-row {
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

.model-preview-card,
.preview-voxel-card {
  position: relative;
  background: repeating-conic-gradient(#f5f5f5 0% 25%, white 0% 50%) 50% / 20px 20px;
  overflow: hidden;
}

.preview-title {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 4;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  font-size: 12px;
}

.model-preview-canvas,
.voxel-canvas {
  width: 100%;
  display: block;
}

.model-preview-canvas {
  height: 220px;
}

.voxel-canvas {
  height: 100%;
  min-height: 70vh;
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
  background: rgba(255, 255, 255, 0.75);
  z-index: 3;
}

.empty-tip {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  padding: 24px;
}

</style>

