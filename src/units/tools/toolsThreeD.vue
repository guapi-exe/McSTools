<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {open as openDialog} from "@tauri-apps/plugin-dialog";
import {fetchSchematicPreviewData, type SchematicPreviewBlockState} from "../../modules/schematic_data.ts";
import {schematic_id, schematicData} from "../../modules/tools_data.ts";
import {toast, getIconUrl} from "../../modules/others.ts";
import {
  BlockWorld,
  InteractiveCanvas,
  ThreeDBlocksRenderer,
  blockResources,
  ensureThreeDBlocksResources,
  exportObjStructurePackageToDirectory,
  loadThreeDBlocksResources,
  type ObjStructureExportProgress,
  type Vec3,
} from "../../modules/3DBLOCKS";
import {
  layers,
  layerMap,
  currentLayer,
  camera_l,
  interactiveCanvas,
  size_l,
  loading_threeD,
  once_threeD,
  structure_l,
  structureRenderer,
  gl_ctx
} from "../../modules/threeD_data.ts"
import { useI18n } from 'vue-i18n';
const { t: $t } = useI18n();
const materialOverview = ref<{id: string, name: string, count: number}[]>([]);
const selectedMaterialId = ref<string | null>(null);
const progress = ref(0)
const sureLoading = ref<boolean>(false);
const showMaterialList = ref(true);
const exportingView = ref(false);
const exportingObjPackage = ref(false);
const objExportProgress = ref<ObjStructureExportProgress | null>(null);
const exportdata = ref(false);
const previewFullscreen = ref(false);

const LARGE_VOLUME_THRESHOLD = 100 * 100 * 100;
const LARGE_BLOCK_THRESHOLD = 250_000;
const PARSE_SLICE_SIZE = 20_000;
const STRUCTURE_ADD_SLICE_SIZE = 8_000;
const MESH_BUILD_SLICE_SIZE = 1_200;
const MATERIAL_HIGHLIGHT_SLICE_SIZE = 25_000;

let activeRunId = 0;
let activeAbortController: AbortController | null = null;
let activeLayerAbortController: AbortController | null = null;
let activeObjExportAbortController: AbortController | null = null;
let materialHighlightTaskId = 0;

const isAbortError = (error: unknown) => (
  error instanceof DOMException && error.name === 'AbortError'
);

const throwIfStale = (runId: number, signal?: AbortSignal) => {
  if (signal?.aborted || runId !== activeRunId) {
    throw new DOMException('3D preview task aborted', 'AbortError');
  }
};

const yieldToUi = async (runId: number, signal?: AbortSignal) => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  throwIfStale(runId, signal);
};

const startPreviewTask = () => {
  activeAbortController?.abort();
  activeLayerAbortController?.abort();
  activeAbortController = new AbortController();
  activeLayerAbortController = null;
  activeRunId += 1;
  return {runId: activeRunId, signal: activeAbortController.signal};
};

const abortPreviewTask = () => {
  activeAbortController?.abort();
  activeLayerAbortController?.abort();
  activeObjExportAbortController?.abort();
  activeAbortController = null;
  activeLayerAbortController = null;
  activeObjExportAbortController = null;
  activeRunId += 1;
};

const formatExportBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const objExportPercent = computed(() => {
  const percent = objExportProgress.value?.percent ?? 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
});

const objExportStatusText = computed(() => {
  const status = objExportProgress.value;
  if (!status) return $t('toolsThreeD.objExportPreparing');

  if (status.stage === 'geometry') {
    return $t('toolsThreeD.objExportGeometryProgress', {
      built: status.builtChunks,
      total: status.totalChunks,
      triangles: status.triangleCount,
      size: formatExportBytes(status.bytesWritten),
    });
  }

  const keyByStage: Record<Exclude<typeof status.stage, 'geometry'>, string> = {
    prepare: 'toolsThreeD.objExportPreparing',
    material: 'toolsThreeD.objExportWritingMaterial',
    texture: 'toolsThreeD.objExportWritingTexture',
    done: 'toolsThreeD.objExportFinalizing',
  };
  return $t(keyByStage[status.stage]);
});

const cancelObjExport = () => {
  activeObjExportAbortController?.abort();
};

const hoveredBlock = ref<{
  pos: [number, number, number], 
  id: string, 
  properties: Record<string, any>,
  items?: Array<{id: string, count: number, slot: number}>
} | null>(null);
const showBlockInfo = ref(false);

const tileEntitiesMap = ref<Map<string, any>>(new Map());

const rayIntersectBounds = (
  rayOrigin: [number, number, number],
  rayDir: [number, number, number],
  boxMin: [number, number, number],
  boxMax: [number, number, number]
): { entry: number, exit: number } | null => {
  let entry = -Infinity;
  let exit = Infinity;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(rayDir[i]) < 1e-8) {
      if (rayOrigin[i] < boxMin[i] || rayOrigin[i] > boxMax[i]) {
        return null;
      }
      continue;
    }

    const t1 = (boxMin[i] - rayOrigin[i]) / rayDir[i];
    const t2 = (boxMax[i] - rayOrigin[i]) / rayDir[i];
    entry = Math.max(entry, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (entry > exit) return null;
  }

  if (exit < 0) return null;
  return {entry, exit};
};

const extractItemsFromNbt = (nbt: any): Array<{id: string, count: number, slot: number}> | undefined => {
  if (!nbt) return undefined;
  
  let items: any[] | undefined;
  if (nbt.type === 'Compound' && nbt.value) {
    const itemsField = nbt.value.Items;
    if (itemsField?.type === 'List' && Array.isArray(itemsField.value)) {
      items = itemsField.value;
    }
  } else if (nbt.Items && Array.isArray(nbt.Items)) {
    items = nbt.Items;
  }
  
  if (!items || items.length === 0) return undefined;
  
  return items.map((item: any) => {
    if (item.type === 'Compound' && item.value) {
      const v = item.value;
      return {
        id: v.id?.value || v.Name?.value || '',
        count: v.Count?.value || v.count?.value || 1,
        slot: v.Slot?.value ?? 0
      };
    }
    return {
      id: item.id || item.Name || '',
      count: item.Count || item.count || 1,
      slot: item.Slot ?? 0
    };
  });
};

const raycastBlocks = (
  rayOrigin: [number, number, number],
  rayDir: [number, number, number]
): { pos: [number, number, number], id: string, properties: Record<string, any>, items?: Array<{id: string, count: number, slot: number}> } | null => {
  const world = structure_l.value;
  const size = size_l.value;
  if (!world || !size) return null;

  const boundsHit = rayIntersectBounds(rayOrigin, rayDir, [0, 0, 0], size);
  if (boundsHit === null) return null;

  const startT = Math.max(0, boundsHit.entry);
  const start: Vec3 = [
    rayOrigin[0] + rayDir[0] * (startT + 1e-5),
    rayOrigin[1] + rayDir[1] * (startT + 1e-5),
    rayOrigin[2] + rayDir[2] * (startT + 1e-5),
  ];
  let x = Math.floor(start[0]);
  let y = Math.floor(start[1]);
  let z = Math.floor(start[2]);

  const stepX = rayDir[0] > 0 ? 1 : -1;
  const stepY = rayDir[1] > 0 ? 1 : -1;
  const stepZ = rayDir[2] > 0 ? 1 : -1;
  const tDeltaX = rayDir[0] !== 0 ? Math.abs(1 / rayDir[0]) : Infinity;
  const tDeltaY = rayDir[1] !== 0 ? Math.abs(1 / rayDir[1]) : Infinity;
  const tDeltaZ = rayDir[2] !== 0 ? Math.abs(1 / rayDir[2]) : Infinity;
  let tMaxX = rayDir[0] !== 0 ? (((rayDir[0] > 0 ? x + 1 : x) - rayOrigin[0]) / rayDir[0]) : Infinity;
  let tMaxY = rayDir[1] !== 0 ? (((rayDir[1] > 0 ? y + 1 : y) - rayOrigin[1]) / rayDir[1]) : Infinity;
  let tMaxZ = rayDir[2] !== 0 ? (((rayDir[2] > 0 ? z + 1 : z) - rayOrigin[2]) / rayDir[2]) : Infinity;
  const maxSteps = Math.max(1, size[0] + size[1] + size[2] + 16);
  let currentT = startT;

  for (let step = 0; step < maxSteps; step += 1) {
    if (currentT > boundsHit.exit) break;
    if (x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2]) {
      break;
    }

    const pos: Vec3 = [x, y, z];
    const block = world.getBlock(pos);
    if (block) {
      const key = `${x},${y},${z}`;
      const nbt = tileEntitiesMap.value.get(key);
      return {
        pos,
        id: block.state.getName().toString(),
        properties: block.state.getProperties(),
        items: extractItemsFromNbt(nbt),
      };
    }

    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX;
      currentT = tMaxX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      y += stepY;
      currentT = tMaxY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      currentT = tMaxZ;
      tMaxZ += tDeltaZ;
    }
  }

  return null;
};

type ViewType = 'free' | 'front' | 'side' | 'top';
const currentView = ref<ViewType>('free');
let layerUpdateScheduled = false;
let layerUpdateInProgress = false;
let pendingLayerTarget: number | null = null;
let renderedStructureRef: BlockWorld | null = null;
let lastAppliedLayer = -1;
let lastAppliedSingleLayerMode = false;
let cacheMode: 'single' | 'cumulative' | null = null;
let cumulativeStructureCache: BlockWorld | null = null;
let cumulativeTopLayer = -1;
let cumulativeMaterialMap = new Map<string, number>();
const singleLayerStructureCache = new Map<number, BlockWorld>();
const singleLayerMaterialCache = new Map<number, {id: string, name: string, count: number}[]>();
const MAX_SINGLE_LAYER_CACHE = 12;
let layerPalette: SchematicPreviewBlockState[] = [];

type LayerUpdateResult = {
  structureChanged: boolean,
  changedChunkPositions?: [number, number, number][],
};

const toMaterialOverview = (materialMap: Map<string, number>) => {
  return Array.from(materialMap.entries())
      .map(([id, count]) => ({
        id,
        name: id.split(':').pop() || id,
        count
      }))
      .sort((a, b) => b.count - a.count);
};

const clearSelectedMaterialHighlight = (clearSelection = true, redraw = true) => {
  materialHighlightTaskId += 1;
  if (clearSelection) selectedMaterialId.value = null;
  structureRenderer.value?.clearSelectionHighlights();
  if (redraw) interactiveCanvas.value?.redraw();
};

const refreshSelectedMaterialHighlight = async (
  runId: number = activeRunId,
  signal: AbortSignal | undefined = activeAbortController?.signal,
) => {
  const materialId = selectedMaterialId.value;
  const renderer = structureRenderer.value;
  const world = structure_l.value;

  if (!materialId || !renderer || !world) {
    clearSelectedMaterialHighlight(false);
    return;
  }

  const taskId = ++materialHighlightTaskId;
  const positions: Vec3[] = [];
  const blocks = world.getBlocks();

  for (let index = 0; index < blocks.length; index += 1) {
    if (taskId !== materialHighlightTaskId || selectedMaterialId.value !== materialId) return;

    const block = blocks[index];
    if (block.state.getName().toString() === materialId) {
      positions.push([block.pos[0], block.pos[1], block.pos[2]]);
    }

    if (index > 0 && index % MATERIAL_HIGHLIGHT_SLICE_SIZE === 0) {
      await yieldToUi(runId, signal);
    }
  }

  if (taskId !== materialHighlightTaskId || selectedMaterialId.value !== materialId) return;
  renderer.setSelectionHighlightPositions(positions);
  interactiveCanvas.value?.redraw();
};

const toggleMaterialHighlight = (materialId: string) => {
  if (selectedMaterialId.value === materialId) {
    clearSelectedMaterialHighlight();
    return;
  }

  selectedMaterialId.value = materialId;
  void refreshSelectedMaterialHighlight().catch((error) => {
    if (!isAbortError(error)) {
      console.error('[3DBLOCKS] material highlight failed', error);
    }
  });
};

const addLayerToStructure = async (
  targetStructure: BlockWorld,
  layerY: number,
  materialMap?: Map<string, number>,
  changedChunkKeys?: Set<string>,
  chunkSize: number = 16,
  runId: number = activeRunId,
  signal?: AbortSignal,
) => {
  const layerBlocks = layers.value[layerY];
  if (!layerBlocks) return;
  for (let index = 0; index < layerBlocks.length; index += 4) {
    const state = layerPalette[layerBlocks[index + 3]];
    if (!state) continue;

    const pos: Vec3 = [
      layerBlocks[index],
      layerBlocks[index + 1],
      layerBlocks[index + 2],
    ];
    targetStructure.addBlock(pos, state.id, state.properties);

    if (changedChunkKeys) {
      const chunkX = Math.floor(pos[0] / chunkSize);
      const chunkY = Math.floor(pos[1] / chunkSize);
      const chunkZ = Math.floor(pos[2] / chunkSize);
      changedChunkKeys.add(`${chunkX},${chunkY},${chunkZ}`);
    }

    if (materialMap) {
      const blockId = state.id;
      if (blockId) {
        materialMap.set(blockId, (materialMap.get(blockId) || 0) + 1);
      }
    }
    if (index > 0 && (index / 4) % STRUCTURE_ADD_SLICE_SIZE === 0) {
      await yieldToUi(runId, signal);
    }
  }
};

const resetStructureCaches = () => {
  cacheMode = null;
  cumulativeStructureCache = null;
  cumulativeTopLayer = -1;
  cumulativeMaterialMap.clear();
  singleLayerStructureCache.clear();
  singleLayerMaterialCache.clear();
  renderedStructureRef = null;
  lastAppliedLayer = -1;
  lastAppliedSingleLayerMode = false;
};

const applyLayerToRenderer = async (
  targetLayer: number,
  runId: number = activeRunId,
  signal: AbortSignal | undefined = activeAbortController?.signal,
) => {
  const updateResult = await updateStructure(targetLayer, runId, signal);
  throwIfStale(runId, signal);
  const renderer = structureRenderer.value;
  const nextStructure = structure_l.value;
  if (!renderer || !nextStructure || !updateResult) return;

  if (lastAppliedLayer === targetLayer && lastAppliedSingleLayerMode === once_threeD.value) {
    interactiveCanvas.value?.redraw();
    return;
  }

  if (updateResult.structureChanged || renderedStructureRef !== nextStructure) {
    await renderer.setStructureProgressiveAsync(nextStructure, MESH_BUILD_SLICE_SIZE, signal, () => {
      interactiveCanvas.value?.redraw();
    });
    renderedStructureRef = nextStructure;
  } else if (updateResult.changedChunkPositions && updateResult.changedChunkPositions.length > 0) {
    await renderer.updateStructureBuffersProgressiveAsync(updateResult.changedChunkPositions as any, MESH_BUILD_SLICE_SIZE, signal, () => {
      interactiveCanvas.value?.redraw();
    });
  }

  throwIfStale(runId, signal);
  await refreshSelectedMaterialHighlight(runId, signal);
  throwIfStale(runId, signal);
  lastAppliedLayer = targetLayer;
  lastAppliedSingleLayerMode = once_threeD.value;
  interactiveCanvas.value?.redraw();
};

const scheduleLayerUpdate = (targetLayer: number) => {
  pendingLayerTarget = Number(targetLayer);

  if (loading_threeD.value && !structureRenderer.value) return;

  if (layerUpdateInProgress) {
    activeLayerAbortController?.abort();
    return;
  }

  if (layerUpdateScheduled) return;

  const runId = activeRunId;
  layerUpdateScheduled = true;

  requestAnimationFrame(async () => {
    layerUpdateScheduled = false;
    if (runId !== activeRunId || layerUpdateInProgress) return;

    layerUpdateInProgress = true;
    try {
      while (pendingLayerTarget !== null && runId === activeRunId) {
        const target = pendingLayerTarget;
        pendingLayerTarget = null;

        activeLayerAbortController = new AbortController();
        const signal = activeLayerAbortController.signal;
        await applyLayerToRenderer(target, runId, signal);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('[3DBLOCKS] layer update failed', error);
      }
    } finally {
      activeLayerAbortController = null;
      layerUpdateInProgress = false;
      if (pendingLayerTarget !== null && runId === activeRunId) {
        scheduleLayerUpdate(pendingLayerTarget);
      }
    }
  });
};

const loadStructure = async (runId: number, signal: AbortSignal) => {
  throwIfStale(runId, signal);
  resetStructureCaches();
  const schematic_data = await fetchSchematicPreviewData(schematic_id.value)
  throwIfStale(runId, signal);
  const schematic_size = schematic_data.size
  const totalVolume = schematic_size.width * schematic_size.height * schematic_size.length
  const flatBlocks = schematic_data.blocks ?? [];
  const palette = schematic_data.palette ?? [];
  const validBlockCount = Math.floor(flatBlocks.length / 4);
  const isLargeStructure = totalVolume >= LARGE_VOLUME_THRESHOLD || validBlockCount >= LARGE_BLOCK_THRESHOLD
  if (isLargeStructure) {
    once_threeD.value = true
  }
  const structure = new BlockWorld([schematic_size.width, schematic_size.height, schematic_size.length])
  const tile_entities_list = schematic_data.tile_entities_list

  const nextTileEntities = new Map<string, any>();
  if (tile_entities_list?.elements) {
    for (let index = 0; index < tile_entities_list.elements.length; index += 1) {
      const te = tile_entities_list.elements[index];
      const { x, y, z } = te.pos;
      const key = `${x},${y},${z}`;
      nextTileEntities.set(key, te.nbt);
      if (index > 0 && index % PARSE_SLICE_SIZE === 0) {
        await yieldToUi(runId, signal);
      }
    }
  }

  progress.value = 0;
  layerPalette = palette;
  const layerCounts = new Map<number, number>();
  const flatSliceSize = PARSE_SLICE_SIZE * 4;

  for (let i = 0; i < flatBlocks.length; i += flatSliceSize) {
    const chunkEnd = Math.min(i + flatSliceSize, flatBlocks.length);
    for (let j = i; j < chunkEnd; j += 4) {
      const layerY = flatBlocks[j + 1];
      layerCounts.set(layerY, (layerCounts.get(layerY) || 0) + 1);
    }

    progress.value = Math.floor((i / Math.max(1, flatBlocks.length)) * 20);
    await yieldToUi(runId, signal);
  }

  const nextLayers: Record<number, Int32Array> = {};
  const layerOffsets = new Map<number, number>();
  for (const [layerY, count] of layerCounts) {
    nextLayers[layerY] = new Int32Array(count * 4);
    layerOffsets.set(layerY, 0);
  }

  let processedBlocks = 0;
  for (let i = 0; i < flatBlocks.length; i += flatSliceSize) {
    const chunkEnd = Math.min(i + flatSliceSize, flatBlocks.length);
    for (let j = i; j < chunkEnd; j += 4) {
      const rx = flatBlocks[j];
      const ry = flatBlocks[j + 1];
      const rz = flatBlocks[j + 2];
      const paletteIndex = flatBlocks[j + 3];
      const state = palette[paletteIndex];
      if (!state) continue;

      const layerBlocks = nextLayers[ry];
      const offset = layerOffsets.get(ry) ?? 0;
      layerBlocks[offset] = rx;
      layerBlocks[offset + 1] = ry;
      layerBlocks[offset + 2] = rz;
      layerBlocks[offset + 3] = paletteIndex;
      layerOffsets.set(ry, offset + 4);

      if (!isLargeStructure || !once_threeD.value) {
        structure.addBlock([rx, ry, rz], state.id, state.properties || {});
      }

      processedBlocks += 1;
    }

    progress.value = 20 + Math.floor((processedBlocks / Math.max(1, validBlockCount)) * 80);
    await yieldToUi(runId, signal);
  }
  throwIfStale(runId, signal);

  layerMap.clear();
  for (const [layerY, layerBlocks] of Object.entries(nextLayers)) {
    layerMap.set(Number(layerY), layerBlocks);
  }
  tileEntitiesMap.value = nextTileEntities;
  structure_l.value = structure;
  size_l.value = [schematic_size.width, schematic_size.height, schematic_size.length];
  layers.value = nextLayers;
  materialOverview.value = (schematic_data.materials ?? [])
      .map((material) => ({
        id: material.id,
        name: material.id.split(':').pop() || material.id,
        count: material.count,
      }))
      .sort((a, b) => b.count - a.count);
  progress.value = 100;
}

const updateStructure = async (
  targetLayer: number,
  runId: number = activeRunId,
  signal?: AbortSignal,
): Promise<LayerUpdateResult | undefined> => {
  throwIfStale(runId, signal);
  if (!size_l.value) return;
  const activeChunkSize = Math.max(1, Math.floor(((structureRenderer.value as any)?.getChunkSize?.() ?? 16)));

  if (once_threeD.value) {
    cacheMode = 'single';
    let cachedStructure = singleLayerStructureCache.get(targetLayer);
    let cachedMaterials = singleLayerMaterialCache.get(targetLayer);

    if (!cachedStructure || !cachedMaterials) {
      const targetStructure = new BlockWorld([...size_l.value]);
      const materialMap = new Map<string, number>();
      await addLayerToStructure(targetStructure, targetLayer, materialMap, undefined, activeChunkSize, runId, signal);

      cachedStructure = targetStructure;
      cachedMaterials = toMaterialOverview(materialMap);

      singleLayerStructureCache.set(targetLayer, cachedStructure);
      singleLayerMaterialCache.set(targetLayer, cachedMaterials);

      if (singleLayerStructureCache.size > MAX_SINGLE_LAYER_CACHE) {
        const oldestKey = singleLayerStructureCache.keys().next().value;
        if (oldestKey !== undefined) {
          singleLayerStructureCache.delete(oldestKey);
          singleLayerMaterialCache.delete(oldestKey);
        }
      }
    }

    const structureChanged = structure_l.value !== cachedStructure;
    structure_l.value = cachedStructure;
    materialOverview.value = cachedMaterials;
    return { structureChanged };
  }

  if (cacheMode !== 'cumulative') {
    cumulativeStructureCache = null;
    cumulativeTopLayer = -1;
    cumulativeMaterialMap = new Map<string, number>();
  }
  cacheMode = 'cumulative';

  if (!cumulativeStructureCache || targetLayer < cumulativeTopLayer) {
    const rebuilt = new BlockWorld([...size_l.value]);
    const materialMap = new Map<string, number>();
    for (let y = 0; y <= targetLayer; y++) {
      await addLayerToStructure(rebuilt, y, materialMap, undefined, activeChunkSize, runId, signal);
      if (y > 0 && y % 16 === 0) {
        await yieldToUi(runId, signal);
      }
    }
    cumulativeStructureCache = rebuilt;
    cumulativeTopLayer = targetLayer;
    cumulativeMaterialMap = materialMap;

    structure_l.value = cumulativeStructureCache;
    materialOverview.value = toMaterialOverview(cumulativeMaterialMap);
    return { structureChanged: true };
  } else if (targetLayer > cumulativeTopLayer) {
    const changedChunkKeys = new Set<string>();
    for (let y = cumulativeTopLayer + 1; y <= targetLayer; y++) {
      await addLayerToStructure(cumulativeStructureCache, y, cumulativeMaterialMap, changedChunkKeys, activeChunkSize, runId, signal);
      if (y > 0 && y % 16 === 0) {
        await yieldToUi(runId, signal);
      }
    }
    cumulativeTopLayer = targetLayer;

    structure_l.value = cumulativeStructureCache;
    materialOverview.value = toMaterialOverview(cumulativeMaterialMap);
    return {
      structureChanged: false,
      changedChunkPositions: Array.from(changedChunkKeys).map(key => key.split(',').map(Number) as [number, number, number]),
    };
  }

  structure_l.value = cumulativeStructureCache;
  materialOverview.value = toMaterialOverview(cumulativeMaterialMap);

  return { structureChanged: false };
}
const reloadRenderer = async (runId: number, signal: AbortSignal) => {
  throwIfStale(runId, signal);
  if (structureRenderer.value) return;

  const structureCanvas = document.getElementById('structure-display') as HTMLCanvasElement;
  const webglOptions: WebGLContextAttributes & {desynchronized?: boolean} = {
    preserveDrawingBuffer: true,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    desynchronized: false,
  };
  const structureGl = (
    structureCanvas.getContext('webgl2', webglOptions)
    || structureCanvas.getContext('webgl', webglOptions)
  ) as WebGL2RenderingContext | WebGLRenderingContext | null;

  if (!structureGl) {
    throw new Error('WebGL is not available');
  }

  if (!blockResources.value) {
    await loadThreeDBlocksResources();
    throwIfStale(runId, signal);
  }
  const renderResources = ensureThreeDBlocksResources(blockResources.value);

  gl_ctx.value = structureGl;
  if (interactiveCanvas.value) {
    camera_l.value = interactiveCanvas.value.getCameraState();
  }

  structureRenderer.value = new ThreeDBlocksRenderer(
      structureGl,
      structure_l.value,
      renderResources,
      {
        atlasMipmaps: false,
        deferInitialBuild: true,
        lazyUpload: false,
        maxPixelRatio: 1.25,
        versionTag: `mcstools@${schematicData.value.game_version ?? 'unknown'}`,
      }
  );
  renderedStructureRef = structure_l.value ?? null;

  let hoverAnimationFrame: number | null = null;
  let lastHoverAnimationRedraw = 0;
  const scheduleHoverAnimation = () => {
    if (hoverAnimationFrame !== null || runId !== activeRunId) return;
    const delay = Math.max(0, 33 - (performance.now() - lastHoverAnimationRedraw));
    hoverAnimationFrame = window.setTimeout(() => {
      hoverAnimationFrame = null;
      lastHoverAnimationRedraw = performance.now();
      if (runId === activeRunId && hoveredBlock.value) {
        interactiveCanvas.value?.redraw();
      }
    }, delay);
  };

  interactiveCanvas.value = new InteractiveCanvas(
      structureCanvas,
      camera_l.value,
      view => {
        const gl = gl_ctx.value;
        if (gl) {
          gl.clearColor(0.9608, 0.9608, 0.9608, 1);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }

        structureRenderer.value?.drawStructure(view)
        structureRenderer.value?.drawSelectionHighlights(view)
        structureRenderer.value?.drawGrid(view)
        
        if (hoveredBlock.value) {
          const pos = hoveredBlock.value.pos;
          structureRenderer.value?.drawOutline(view, pos);
          scheduleHoverAnimation();
        }
      },
      [size_l.value[0] / 2, size_l.value[1] / 2, size_l.value[2] / 2]
  );
  
  let hoverThrottleTimer: number | null = null;
  let hoverClearTimer: number | null = null;
  let pendingRayData: { rayOrigin: [number, number, number], rayDir: [number, number, number] } | null = null;

  const clearHover = () => {
    hoverClearTimer = null;
    if (runId !== activeRunId) return;
    if (hoveredBlock.value) {
      hoveredBlock.value = null;
      showBlockInfo.value = false;
      interactiveCanvas.value?.redraw();
    }
  };

  const scheduleClearHover = () => {
    if (hoverClearTimer !== null || !hoveredBlock.value) return;
    hoverClearTimer = window.setTimeout(clearHover, 80);
  };
  
  const processHover = () => {
    hoverThrottleTimer = null;
    if (runId !== activeRunId) return;
    
    if (!pendingRayData || !structure_l.value) {
      scheduleClearHover();
      return;
    }
    
    const { rayOrigin, rayDir } = pendingRayData;
    const hitBlock = raycastBlocks(rayOrigin, rayDir);

    if (!hitBlock) {
      scheduleClearHover();
      return;
    }

    if (hoverClearTimer !== null) {
      clearTimeout(hoverClearTimer);
      hoverClearTimer = null;
    }
    
    const prevPos = hoveredBlock.value?.pos;
    const newPos = hitBlock?.pos;
    
    const posChanged = !prevPos !== !newPos ||
      (prevPos && newPos && (prevPos[0] !== newPos[0] || prevPos[1] !== newPos[1] || prevPos[2] !== newPos[2]));
    
    if (posChanged) {
      hoveredBlock.value = hitBlock;
      showBlockInfo.value = !!hitBlock;
      interactiveCanvas.value?.redraw();
    }
  };
  
  interactiveCanvas.value.setBlockHoverHandler((rayData) => {
    pendingRayData = rayData;
    
    if (!rayData) {
      if (hoverThrottleTimer) {
        cancelAnimationFrame(hoverThrottleTimer);
        hoverThrottleTimer = null;
      }
      processHover();
      return;
    }
    
    if (!hoverThrottleTimer) {
      hoverThrottleTimer = requestAnimationFrame(processHover);
    }
  });
};

const switchView = (viewType: ViewType) => {
  currentView.value = viewType;

  if (!interactiveCanvas.value) return;

  const cam = interactiveCanvas.value as any;

  const maxDist = Math.max(...size_l.value) * 2;
  const focus: [number, number, number] = [
    size_l.value[0] / 2,
    size_l.value[1] / 2,
    size_l.value[2] / 2,
  ];

  switch (viewType) {
    case 'front':
      cam.setOrbitView(0, 0, maxDist / 2, focus);
      break;
    case 'side':
      cam.setOrbitView(0, Math.PI / 2, maxDist / 2, focus);
      break;
    case 'top':
      cam.setOrbitView(Math.PI / 2, 0, maxDist / 2, focus);
      break;
    case 'free':
      cam.redraw();
      break;
  }
}

const requestPreviewRedraw = () => {
  requestAnimationFrame(() => {
    interactiveCanvas.value?.redraw();
    window.setTimeout(() => interactiveCanvas.value?.redraw(), 80);
  });
};

const getPreviewElement = () => document.getElementById('structure-preview-pane') as HTMLElement | null;

const syncPreviewFullscreen = () => {
  const element = getPreviewElement();
  previewFullscreen.value = !!element && document.fullscreenElement === element;
  requestPreviewRedraw();
};

const togglePreviewFullscreen = async () => {
  const element = getPreviewElement();
  if (!element) return;

  if (previewFullscreen.value && document.fullscreenElement !== element) {
    previewFullscreen.value = false;
    requestPreviewRedraw();
    return;
  }

  try {
    if (document.fullscreenElement === element) {
      await document.exitFullscreen();
    } else {
      await element.requestFullscreen();
    }
  } catch (error) {
    previewFullscreen.value = !previewFullscreen.value;
  } finally {
    requestPreviewRedraw();
  }
};

const prepareCurrentSchematic = async () => {
  destroyData();
  let size = schematicData.value.sizes
  const [length, width, height] = size.split(',').map(Number);
  if (length * width * height >= LARGE_VOLUME_THRESHOLD) sureLoading.value = true
  else await loadInit();
};

onMounted(async () => {
  document.addEventListener('fullscreenchange', syncPreviewFullscreen);
  await prepareCurrentSchematic();
})

const loadInit = async () => {
  const {runId, signal} = startPreviewTask();
  try {
    resetViewData();
    loading_threeD.value = true;
    await loadStructure(runId, signal);
    throwIfStale(runId, signal);
    lastAppliedLayer = -1;
    lastAppliedSingleLayerMode = false;
    currentLayer.value = size_l.value[1] - 1;
    if (size_l.value[0] * size_l.value[1] * size_l.value[2] >= LARGE_VOLUME_THRESHOLD) {
      once_threeD.value = true;
      toast.info($t('toolsThreeD.largeSizeSingleLayer'), {timeout: 3000})
    }
    await reloadRenderer(runId, signal);
    throwIfStale(runId, signal);

    if (once_threeD.value) {
      await applyLayerToRenderer(currentLayer.value, runId, signal);
    } else {
      const renderer = structureRenderer.value;
      if (renderer) {
        await renderer.updateStructureBuffersProgressiveAsync(undefined, MESH_BUILD_SLICE_SIZE, signal, () => {
          interactiveCanvas.value?.redraw();
        });
        renderedStructureRef = structure_l.value ?? null;
        interactiveCanvas.value?.redraw();
      }
    }

  }catch (e) {
    if (!isAbortError(e)) {
      toast.error($t('toolsThreeD.error', {error: String(e)}), {timeout: 3000});
    }
  }finally {
    if (runId === activeRunId) {
      loading_threeD.value = false;
    }
  }
}
watch(currentLayer, (newVal) => {
  scheduleLayerUpdate(newVal);
});


watch(once_threeD, () => {
  scheduleLayerUpdate(currentLayer.value);
});

watch(schematic_id, () => {
  void prepareCurrentSchematic();
});

const resetViewData = () => {
  clearSelectedMaterialHighlight(true, false);
  structureRenderer.value?.dispose();
  interactiveCanvas.value?.dispose?.();
  resetStructureCaches();
  loading_threeD.value = false;
  layerPalette = [];
  layers.value = {};
  layerMap.clear();
  structure_l.value = undefined;
  size_l.value = undefined;
  camera_l.value = undefined;
  once_threeD.value = false;
  currentLayer.value = 0;
  structureRenderer.value = null;
  interactiveCanvas.value = null;
  gl_ctx.value = null;
}

const destroyData = () => {
  abortPreviewTask();
  pendingLayerTarget = null;
  layerUpdateScheduled = false;
  layerUpdateInProgress = false;
  resetViewData();
}

const exportCurrentView = async () => {
  const canvas = document.getElementById('structure-display') as HTMLCanvasElement;
  if (!canvas) {
    toast.error($t('toolsThreeD.viewsNotReady'), { timeout: 3000 });
    return;
  }

  try {
    exportingView.value = true;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height + 120;

    const ctx = exportCanvas.getContext('2d')!;

    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    ctx.fillStyle = '#000';
    ctx.font = 'bold 24px Arial';

    if (!exportdata.value) {
      let viewName = '';
      switch (currentView.value) {
        case 'front': viewName = $t('toolsThreeD.frontView'); break;
        case 'side':  viewName = $t('toolsThreeD.sideView');  break;
        case 'top':   viewName = $t('toolsThreeD.topView');   break;
        case 'free':  viewName = $t('toolsThreeD.freeView');  break;
      }
      ctx.fillText(viewName, 20, 35);
    } else {
      const info = schematicData.value;

      const [sx, sy, sz] = info.sizes.split(',').map(Number);

      ctx.font = 'bold 26px Arial';
      ctx.fillText(info.name, 20, 35);

      ctx.font = '18px Arial';
      ctx.fillText(`${$t('toolsThreeD.size')}: ${sx} × ${sy} × ${sz}`, 20, 65);
      ctx.fillText(`${$t('toolsThreeD.author')}: ${info.user}`, 20, 90);
      ctx.fillText(`${$t('toolsThreeD.version')}: ${info.game_version}`, 20, 115);
    }

    ctx.drawImage(canvas, 0, 120);

    const dataUrl = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `structure-${currentView.value}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();

    toast.success($t('toolsThreeD.exportSuccess'), { timeout: 3000 });

  } catch (error) {
    toast.error($t('toolsThreeD.exportError', { error: String(error) }), { timeout: 3000 });

  } finally {
    exportingView.value = false;
  }
};

const getObjExportBaseName = () => {
  const sourceName = schematicData.value?.name || `structure_${schematic_id.value}`;
  const maxLayer = size_l.value ? Math.max(0, size_l.value[1] - 1) : currentLayer.value;
  const layerSuffix = once_threeD.value
    ? `layer_${currentLayer.value}`
    : (currentLayer.value >= maxLayer ? 'full' : `to_layer_${currentLayer.value}`);
  return `${sourceName}_${layerSuffix}`;
};

const exportCurrentStructureObjPackage = async () => {
  if (exportingObjPackage.value) return;

  const world = structure_l.value;
  const gl = gl_ctx.value;
  const resources = blockResources.value ? ensureThreeDBlocksResources(blockResources.value) : null;

  if (!world || !gl || !resources || loading_threeD.value) {
    toast.error($t('toolsThreeD.objExportNoStructure'), {timeout: 3000});
    return;
  }

  const runId = activeRunId;
  const previewSignal = activeAbortController?.signal;
  const baseName = getObjExportBaseName();
  const exportAbortController = new AbortController();
  const abortExportOnPreviewAbort = () => exportAbortController.abort();

  try {
    exportingObjPackage.value = true;
    objExportProgress.value = null;
    activeObjExportAbortController?.abort();
    activeObjExportAbortController = exportAbortController;
    previewSignal?.addEventListener('abort', abortExportOnPreviewAbort, {once: true});

    const targetDirectory = await openDialog({
      title: $t('toolsThreeD.objExportSelectDirectory'),
      directory: true,
      multiple: false,
      recursive: true,
      canCreateDirectories: true,
    });

    if (!targetDirectory) return;
    throwIfStale(runId, previewSignal);

    const result = await exportObjStructurePackageToDirectory({
      world,
      resources,
      gl,
      name: baseName,
      targetDirectory,
      chunkSize: structureRenderer.value?.getChunkSize(),
      blocksPerSlice: MESH_BUILD_SLICE_SIZE,
      signal: exportAbortController.signal,
      onProgress: (nextProgress) => {
        objExportProgress.value = nextProgress;
      },
    });

    throwIfStale(runId, previewSignal);
    toast.success($t('toolsThreeD.objExportSuccess', {triangles: result.triangleCount}), {timeout: 3000});
  } catch (error) {
    if (isAbortError(error)) {
      toast.info($t('toolsThreeD.objExportCancelled'), {timeout: 2500});
      return;
    }
    const message = error instanceof Error && error.message === 'No exportable geometry'
      ? $t('toolsThreeD.objExportEmpty')
      : $t('toolsThreeD.objExportError', {error: String(error)});
    toast.error(message, {timeout: 3000});
  } finally {
    previewSignal?.removeEventListener('abort', abortExportOnPreviewAbort);
    if (activeObjExportAbortController === exportAbortController) {
      activeObjExportAbortController = null;
    }
    exportingObjPackage.value = false;
    objExportProgress.value = null;
  }
};

onBeforeUnmount(async () => {
  document.removeEventListener('fullscreenchange', syncPreviewFullscreen);
  destroyData();
});
</script>

<template>
  <v-row no-gutters class="container">
    <v-col v-if="showMaterialList" cols="3">
      <v-container style="max-height: 100vh; overflow-y: auto;">
        <v-list lines="two" class="scrollable-list">
          <v-list-item
            v-for="material in materialOverview"
            :key="material.id"
            class="material-item d-flex justify-space-between"
            :class="{ 'material-item-selected': selectedMaterialId === material.id }"
            @click="toggleMaterialHighlight(material.id)"
          >
            <template #prepend>
              <v-avatar size="40" rounded="0" class="mr-2 avatar-bg">
                <img :src="getIconUrl(material.id)" :alt="material.id">
              </v-avatar>
            </template>

            <v-list-item-title class="material-name">
              {{ material.name }}
            </v-list-item-title>

            <v-list-item-subtitle class="material-info">
              ID: {{ material.id }}
            </v-list-item-subtitle>

            <template #append>
              <v-chip
                size="small"
                :color="selectedMaterialId === material.id ? 'amber-darken-2' : 'blue'"
                class="ml-2"
              >
                <v-icon start icon="mdi-cube"></v-icon>
                {{ material.count }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>
      </v-container>

    </v-col>

    <v-col :cols="showMaterialList ? 9 : 12" class="preview-column">
      <div
        id="structure-preview-pane"
        class="preview-pane"
        :class="{ 'preview-pane-fullscreen': previewFullscreen }"
      >
      <canvas class="gpu-canvas" id="structure-display" width="1150" height="800"></canvas>

      <div class="top-controls">
        <v-btn
          :icon="showMaterialList ? 'mdi-chevron-left' : 'mdi-chevron-right'"
          variant="text"
          @click="showMaterialList = !showMaterialList"
          :title="showMaterialList ? $t('toolsThreeD.hideMaterialList') : $t('toolsThreeD.showMaterialList')"
        ></v-btn>

        <v-btn
          :icon="previewFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
          variant="text"
          @click="togglePreviewFullscreen"
          :title="previewFullscreen ? '退出全屏' : '全屏预览'"
        ></v-btn>

        <v-btn-toggle
          v-model="currentView"
          mandatory
          color="primary"
          density="compact"
          class="ml-2"
        >
          <v-btn value="free" size="small">
            <v-icon>mdi-rotate-3d-variant</v-icon>
            <v-tooltip activator="parent" location="bottom">{{$t('toolsThreeD.freeView')}}</v-tooltip>
          </v-btn>
          <v-btn value="front" size="small" @click="switchView('front')">
            <v-icon>mdi-arrow-left-right</v-icon>
            <v-tooltip activator="parent" location="bottom">{{$t('toolsThreeD.frontView')}}</v-tooltip>
          </v-btn>
          <v-btn value="side" size="small" @click="switchView('side')">
            <v-icon>mdi-arrow-up-down</v-icon>
            <v-tooltip activator="parent" location="bottom">{{$t('toolsThreeD.sideView')}}</v-tooltip>
          </v-btn>
          <v-btn value="top" size="small" @click="switchView('top')">
            <v-icon>mdi-arrow-all</v-icon>
            <v-tooltip activator="parent" location="bottom">{{$t('toolsThreeD.topView')}}</v-tooltip>
          </v-btn>
        </v-btn-toggle>        
        <v-checkbox
            class="export-checkbox"
            :label="$t('toolsThreeD.annotation')"
            v-model="exportdata"
        ></v-checkbox>
        <v-btn
          color="success"
          variant="outlined"
          prepend-icon="mdi-download"
          :loading="exportingView"
          @click="exportCurrentView"
          class="ml-2"
          size="small"
        >
          {{$t('toolsThreeD.exportView')}}
        </v-btn>
        <v-btn
          color="secondary"
          variant="outlined"
          prepend-icon="mdi-cube-send"
          :loading="exportingObjPackage"
          :disabled="loading_threeD || !structure_l || !gl_ctx"
          @click="exportCurrentStructureObjPackage"
          class="ml-2"
          size="small"
        >
          {{$t('toolsThreeD.exportObjPackage')}}
        </v-btn>
      </div>

      <!-- 右侧滑块控制 -->
      <div class="slider-container">
        <input
            type="range"
            class="vertical-slider"
            v-model.number="currentLayer"
            :min="0"
            :max="size_l ? size_l[1] - 1 : 0"
        />
        <div class="layer-indicator">{{$t('toolsThreeD.currentLayer')}}: {{ currentLayer }}</div>

        <v-switch
          class="ml-4"
          v-model="once_threeD"
          :label="$t('toolsThreeD.singleLayer')"
          color="green"
          density="compact"
          :hint="$t('toolsThreeD.singleLayerHint')"
          persistent-hint
        ></v-switch>
      </div>

      <div v-if="loading_threeD" class="loading-overlay">
        <div class="loader">
          <div class="spinner"></div>
          <p>{{$t('toolsThreeD.loadingStructure')}}</p>
          <div class="progress-container">
            <div
                class="progress-bar"
                :style="{ width: progress + '%' }"
            ></div>
          </div>
          <p>{{ progress }}%</p>
        </div>
      </div>

      <div v-if="exportingObjPackage" class="loading-overlay export-progress-overlay">
        <div class="loader export-progress-card">
          <div class="spinner"></div>
          <p class="export-progress-title">{{$t('toolsThreeD.objExporting')}}</p>
          <div class="progress-container export-progress-track">
            <div
              class="progress-bar"
              :style="{ width: objExportPercent + '%' }"
            ></div>
          </div>
          <p class="export-progress-percent">{{ objExportPercent }}%</p>
          <p class="export-progress-detail">{{ objExportStatusText }}</p>
          <v-btn
            color="error"
            variant="outlined"
            size="small"
            @click="cancelObjExport"
          >
            {{$t('toolsThreeD.objExportCancel')}}
          </v-btn>
        </div>
      </div>

      <div v-if="sureLoading" class="loading-overlay">
        <div class="loader">
          <v-alert
              variant="tonal"
              color="red"
              icon="mdi-information-outline"
              class="mt-4 monospace-font"
          >
            {{$t('toolsThreeD.confirmLargeLoad', {size: schematicData.sizes})}}
          </v-alert>
          <div class="button-group">
            <v-btn
                density="default"
                color="blue"
                variant="outlined"
                prepend-icon="mdi-reload-alert"
                @click="sureLoading = false;loadInit()"
            >
              {{$t('toolsThreeD.confirmLoad')}}
            </v-btn>
          </div>
        </div>
      </div>

      <!-- 方块信息悬浮框 -->
      <v-card
        v-if="showBlockInfo && hoveredBlock"
        class="block-info-card"
        elevation="8"
      >
        <v-card-title class="d-flex align-center py-2">
          <v-avatar size="32" rounded="0" class="mr-2">
            <img :src="getIconUrl(hoveredBlock.id)" :alt="hoveredBlock.id">
          </v-avatar>
          {{ hoveredBlock.id.split(':').pop() }}
        </v-card-title>
        <v-card-text class="py-2">
          <div><strong>{{ $t('toolsThreeD.blockId') }}:</strong> {{ hoveredBlock.id }}</div>
          <div><strong>{{ $t('toolsThreeD.blockCoord') }}:</strong> [{{ hoveredBlock.pos.join(', ') }}]</div>
          <div v-if="Object.keys(hoveredBlock.properties).length > 0">
            <strong>{{ $t('toolsThreeD.blockProperties') }}:</strong>
            <ul class="properties-list">
              <li v-for="(value, key) in hoveredBlock.properties" :key="key">
                {{ key }}: {{ value }}
              </li>
            </ul>
          </div>
          <div v-if="hoveredBlock.items && hoveredBlock.items.length > 0" class="mt-2">
            <strong>{{ $t('toolsThreeD.containerItems') }}:</strong>
            <div class="items-grid mt-1">
              <div v-for="(item, idx) in hoveredBlock.items" :key="idx" class="item-slot">
                <v-avatar size="32" rounded="0" class="item-icon">
                  <img :src="getIconUrl(item.id)" :alt="item.id">
                </v-avatar>
                <span class="item-count" v-if="item.count > 1">{{ item.count }}</span>
                <v-tooltip activator="parent" location="top">
                  {{ item.id.split(':').pop() }} x{{ item.count }}
                </v-tooltip>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>

      </div>
    </v-col>
  </v-row>
</template>

<style scoped>
.container {
  display: flex;
  height: 100vh;
  width: 100%;
}

.preview-column {
  min-width: 0;
}

.preview-pane {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #f5f5f5;
}

.preview-pane-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 3000;
  width: 100vw;
  height: 100vh;
}

.preview-pane:fullscreen {
  width: 100vw;
  height: 100vh;
  background: #f5f5f5;
}

.gpu-canvas {
  image-rendering: crisp-edges;
  touch-action: none;
}

#structure-display {
  aspect-ratio: 1150 / 800;
  width: min(100%, 1150px);
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 0 10px rgba(0,0,0,0.1);
}

.preview-pane-fullscreen #structure-display,
.preview-pane:fullscreen #structure-display {
  width: min(100vw, calc(100vh * 1.4375));
  height: min(100vh, calc(100vw / 1.4375));
  max-width: none;
  max-height: none;
  box-shadow: none;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.top-controls {
  position: absolute;
  left: 20px;
  top: 20px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  z-index: 100;
  max-width: calc(100% - 40px);
  background: rgba(255, 255, 255, 0.9);
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.slider-container {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  z-index: 100;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.export-progress-overlay {
  z-index: 260;
  background: rgba(245, 247, 250, 0.86);
}

.export-progress-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: min(520px, calc(100vw - 40px));
  padding: 24px 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
}

.export-progress-card .spinner {
  align-self: center;
}

.export-progress-card .v-btn {
  align-self: center;
}

.export-progress-title,
.export-progress-percent,
.export-progress-detail {
  width: 100%;
  margin-left: 0;
  margin-right: 0;
}

.export-progress-title {
  margin: 12px 0 14px;
  text-align: center;
  font-size: 15px;
}

.export-progress-track {
  width: 100%;
}

.export-progress-percent {
  margin: 10px 0 0;
  text-align: center;
  color: #263238;
}

.export-progress-detail {
  min-height: 42px;
  margin: 8px 0 14px;
  font-size: 13px;
  line-height: 1.45;
  color: #455a64;
  word-break: break-word;
}

.vertical-slider {
  writing-mode: bt-lr;
  -webkit-appearance: slider-vertical;
  appearance: slider-vertical;
  width: 8px;
  height: 200px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.layer-indicator {
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 14px;
}

.scrollable-list {
  overflow-y: auto;
  padding: 8px;
}

.material-item {
  cursor: pointer;
  border-left: 4px solid transparent;
  transition: background 0.18s ease, border-color 0.18s ease;
}
.button-group {
  display: flex;
  gap: 16px;
  justify-content: center;
}
.material-item:hover {
  background: rgba(255, 152, 0, 0.15);
}

.material-item-selected {
  background: rgba(255, 193, 7, 0.22);
  border-left-color: #f5b301;
  font-weight: bold;
}

.avatar-bg {
  background: rgba(30, 30, 30, 0.2);
}

.material-name {
  font-size: 1rem;
  font-weight: bold;
}

.material-info {
  font-size: 0.85rem;
  color: #888;
}
.export-checkbox {
  --v-input-control-height: 24px !important;
  transform: scale(0.8);
  margin: 0 4px;
  display: flex;
  align-items: center;
}

.block-info-card {
  position: absolute;
  right: 20px;
  top: 20px;
  min-width: 280px;
  max-width: 350px;
  max-height: min(45vh, 420px);
  z-index: 140;
  pointer-events: none;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 220, 180, 0.55);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18), 0 0 18px rgba(0, 220, 180, 0.22);
}

.properties-list {
  margin: 4px 0 0 16px;
  padding: 0;
  list-style: disc;
}

.properties-list li {
  font-family: monospace;
  font-size: 0.9rem;
}

.items-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.item-slot {
  position: relative;
  width: 32px;
  height: 32px;
  background: rgba(139, 139, 139, 0.3);
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-icon {
  background: transparent;
}

.item-count {
  position: absolute;
  bottom: 0;
  right: 2px;
  font-size: 10px;
  font-weight: bold;
  color: white;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8);
}

</style>
