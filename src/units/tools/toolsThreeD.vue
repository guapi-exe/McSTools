<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {
  Structure, StructureRenderer,
} from "deepslate";
import {InteractiveCanvas} from "../../modules/threed_data/deepslateInit.ts";
import {fetchSchematicData} from "../../modules/schematic_data.ts";
import {schematic_id, schematicData} from "../../modules/tools_data.ts";
import {blocks_resources} from "../../modules/threed_data/deepslateInit.ts";
import {toast, getIconUrl} from "../../modules/others.ts";
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
const progress = ref(0)
const sureLoading = ref<boolean>(false);
const showMaterialList = ref(true);
const exportingView = ref(false);
const exportdata = ref(false);

const hoveredBlock = ref<{
  pos: [number, number, number], 
  id: string, 
  properties: Record<string, any>,
  items?: Array<{id: string, count: number, slot: number}>
} | null>(null);
const showBlockInfo = ref(false);

const tileEntitiesMap = ref<Map<string, any>>(new Map());

const rayIntersectAABB = (
  rayOrigin: [number, number, number],
  rayDir: [number, number, number],
  boxMin: [number, number, number],
  boxMax: [number, number, number]
): number | null => {
  let tMin = -Infinity;
  let tMax = Infinity;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(rayDir[i]) < 1e-8) {
      if (rayOrigin[i] < boxMin[i] || rayOrigin[i] > boxMax[i]) {
        return null;
      }
    } else {
      const t1 = (boxMin[i] - rayOrigin[i]) / rayDir[i];
      const t2 = (boxMax[i] - rayOrigin[i]) / rayDir[i];
      const tNear = Math.min(t1, t2);
      const tFar = Math.max(t1, t2);
      
      tMin = Math.max(tMin, tNear);
      tMax = Math.min(tMax, tFar);
      
      if (tMin > tMax || tMax < 0) {
        return null;
      }
    }
  }
  
  return tMin >= 0 ? tMin : tMax;
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
  if (!structure_l.value || !size_l.value) return null;

  let closestHit: { pos: [number, number, number], id: string, properties: Record<string, any>, distance: number } | null = null;

  const layersToCheck = once_threeD.value
    ? [currentLayer.value] 
    : Array.from({ length: currentLayer.value + 1 }, (_, i) => i);

  for (const layerY of layersToCheck) {
    const layerBlocks = layers.value[layerY];
    if (!layerBlocks) continue;

    for (const block of layerBlocks) {
      const [x, y, z] = block.pos;
      
      const boxMin: [number, number, number] = [x, y, z];
      const boxMax: [number, number, number] = [x + 1, y + 1, z + 1];
      
      const distance = rayIntersectAABB(rayOrigin, rayDir, boxMin, boxMax);
      
      if (distance !== null && (closestHit === null || distance < closestHit.distance)) {
        closestHit = {
          pos: block.pos,
          id: block.block.id,
          properties: block.block.properties,
          distance
        };
      }
    }
  }

  if (closestHit) {
    const key = `${closestHit.pos[0]},${closestHit.pos[1]},${closestHit.pos[2]}`;
    const nbt = tileEntitiesMap.value.get(key);
    const items = extractItemsFromNbt(nbt);
    
    return {
      pos: closestHit.pos,
      id: closestHit.id,
      properties: closestHit.properties,
      items
    };
  }
  
  return null;
};

type ViewType = 'free' | 'front' | 'side' | 'top';
const currentView = ref<ViewType>('free');
const loadStructure = async () => {
  const schematic_data = await fetchSchematicData(schematic_id.value)
  const schematic_size = schematic_data.size
  const structure = new Structure([schematic_size.width, schematic_size.height, schematic_size.length])
  const blocks = schematic_data.blocks
  const tile_entities_list = schematic_data.tile_entities_list
  
  tileEntitiesMap.value.clear();
  if (tile_entities_list?.elements) {
    for (const te of tile_entities_list.elements) {
      const { x, y, z } = te.pos;
      const key = `${x},${y},${z}`;
      tileEntitiesMap.value.set(key, te.nbt);
    }
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  const validElements = [];
  const materialMap = new Map<string, number>();
  progress.value = 0;
  const CHUNK_SIZE = 5000;
  for (let i = 0; i < blocks.elements.length; i += CHUNK_SIZE) {
    const chunkEnd = Math.min(i + CHUNK_SIZE, blocks.elements.length);
    for (let j = i; j < chunkEnd; j++) {
      const element = blocks.elements[j];
      const pos = element.pos;
      if (!element.block) {
        console.warn('Element has no block:', element);
        continue;
      }
      if (typeof element.block.id === 'string' && element.block.id.toLowerCase() === 'minecraft:air') {
        continue;
      }
      if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') {
        continue;
      }
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      const z = Math.round(pos.z);
      validElements.push(element);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      const blockId = element.block.id;
      if (blockId) {
        materialMap.set(blockId, (materialMap.get(blockId) || 0) + 1);
      }
    }
    progress.value = Math.floor((i / blocks.elements.length) * 40);
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();
  }

  layers.value = {};
  materialOverview.value = Array.from(materialMap.entries())
      .map(([id, count]) => ({
        id,
        name: id.split(':').pop() || id,
        count
      }))
      .sort((a, b) => b.count - a.count);
  for (let i = 0; i < blocks.elements.length; i += CHUNK_SIZE) {
    const chunkEnd = Math.min(i + CHUNK_SIZE, blocks.elements.length);

    for (let j = i; j < chunkEnd; j++) {
      const element = blocks.elements[j];
      if (!element.block || element.block.id?.toLowerCase() === 'minecraft:air') continue;

      const { x, y, z } = element.pos;
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') continue;

      const rx = Math.round(x - minX);
      const ry = Math.round(y - minY);
      const rz = Math.round(z - minZ);

      validElements.push(element);

      if (!layerMap.has(ry)) {
        layerMap.set(ry, []);
      }
      layerMap.get(ry)!.push({
        pos: [rx, ry, rz],
        block: {
          id: element.block.id,
          properties: element.block.properties || {}
        }
      });
    }
    progress.value = 40 + Math.floor((i / blocks.elements.length) * 60);
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();
  }

  const addBlocksToStructure = (elements: typeof blocks.elements) => {
    for (const element of elements) {
      const { x, y, z } = element.pos;
      structure.addBlock(
          [Math.round(x - minX), Math.round(y - minY), Math.round(z - minZ)],
          element.block.id,
          element.block.properties || {}
      );
    }
  };
  for (let i = 0; i < validElements.length; i += CHUNK_SIZE) {
    const chunk = validElements.slice(i, i + CHUNK_SIZE);
    addBlocksToStructure(chunk);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  const layersObj: Record<number, any> = {};
  for (const [y, blocks] of layerMap) {
    layersObj[y] = blocks;
  }
  structure_l.value = structure;
  size_l.value = structure.getSize();
  layers.value = layersObj;
}

const updateStructure = (targetLayer: number) => {
  if (!size_l.value) return;

  const newStructure = new Structure([...size_l.value]);
  if (once_threeD.value) {
    const materialMap = new Map<string, number>();
    layers.value[targetLayer].forEach(block => {
      const blockId = block.block.id;
      if (blockId) {
        materialMap.set(blockId, (materialMap.get(blockId) || 0) + 1);
      }
      newStructure.addBlock(block.pos, block.block.id, block.block.properties);
    });
    materialOverview.value = Array.from(materialMap.entries())
        .map(([id, count]) => ({
          id,
          name: id.split(':').pop() || id,
          count
        }))
        .sort((a, b) => b.count - a.count);
  }else {
    const materialMap = new Map<string, number>();
    for (let y = 0; y <= targetLayer; y++) {
      if (layers.value[y]) {
        layers.value[y].forEach(block => {
          const blockId = block.block.id;
          if (blockId) {
            materialMap.set(blockId, (materialMap.get(blockId) || 0) + 1);
          }
          newStructure.addBlock(block.pos, block.block.id, block.block.properties);
        });
      }
    }
    materialOverview.value = Array.from(materialMap.entries())
        .map(([id, count]) => ({
          id,
          name: id.split(':').pop() || id,
          count
        }))
        .sort((a, b) => b.count - a.count);
  }

  structure_l.value = newStructure;
}
const reloadRenderer = async () => {
  if (structureRenderer.value) return;

  const structureCanvas = document.getElementById('structure-display') as HTMLCanvasElement;
  let structureGl = structureCanvas.getContext('webgl', { preserveDrawingBuffer: true })!;

  gl_ctx.value = structureGl;
  if (interactiveCanvas.value) {
    camera_l.value = {
      xRotation: (interactiveCanvas.value as any).xRotation,
      yRotation: (interactiveCanvas.value as any).yRotation,
      viewDist: (interactiveCanvas.value as any).viewDist
    };
  }

  structureRenderer.value = new StructureRenderer(
      structureGl,
      structure_l.value,
      blocks_resources.value,
      {
        facesPerBuffer: 500,
        chunkSize: 16,
        useInvisibleBlockBuffer: true,
      }
  );

  interactiveCanvas.value = new InteractiveCanvas(
      structureCanvas,
      camera_l.value,
      view => {
        const gl = gl_ctx.value;
        if (gl) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }

        structureRenderer.value.drawStructure(view)
        structureRenderer.value.drawGrid(view)
        
        if (hoveredBlock.value) {
          const pos = hoveredBlock.value.pos;
          structureRenderer.value.drawOutline(view, pos);
          structureRenderer.value.drawOutline(view, [pos[0] + 0.002, pos[1] + 0.002, pos[2] + 0.002] as any);
          structureRenderer.value.drawOutline(view, [pos[0] - 0.002, pos[1] - 0.002, pos[2] - 0.002] as any);
        }
      },
      [size_l.value[0] / 2, size_l.value[1] / 2, size_l.value[2] / 2]
  );
  
  let hoverThrottleTimer: number | null = null;
  let pendingRayData: { rayOrigin: [number, number, number], rayDir: [number, number, number] } | null = null;
  
  const processHover = () => {
    hoverThrottleTimer = null;
    
    if (!pendingRayData || !structure_l.value) {
      if (hoveredBlock.value) {
        hoveredBlock.value = null;
        showBlockInfo.value = false;
        interactiveCanvas.value?.redraw();
      }
      return;
    }
    
    const { rayOrigin, rayDir } = pendingRayData;
    const hitBlock = raycastBlocks(rayOrigin, rayDir);
    
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

  switch (viewType) {
    case 'front':
      cam.xRotation = 0;
      cam.yRotation = 0;
      cam.viewDist = maxDist / 2;
      break;
    case 'side':
      cam.xRotation = 0;
      cam.yRotation = Math.PI / 2;
      cam.viewDist = maxDist / 2;
      break;
    case 'top':
      cam.xRotation = Math.PI / 2;
      cam.yRotation = 0;
      cam.viewDist = maxDist / 2;
      break;
  }

  cam.redraw();
}

onMounted(async () => {
  let size = schematicData.value.sizes
  const [length, width, height] = size.split(',').map(Number);
  if (length * width * height >= 100*100*100) sureLoading.value = true
  else await loadInit();
})

const loadInit = async () => {
  try {
    loading_threeD.value = true;
    await loadStructure();
    console.log("done")
    currentLayer.value = size_l.value[1] - 1;
    if (size_l.value[0] * size_l.value[1] * size_l.value[2] >= 100 * 100 * 100) {
      once_threeD.value = true;
      toast.info($t('toolsThreeD.largeSizeSingleLayer'), {timeout: 3000})
    }
    await reloadRenderer();

  }catch (e) {
    toast.error($t('toolsThreeD.error', {error: String(e)}), {timeout: 3000});
  }finally {
    loading_threeD.value = false;
  }
}
watch(currentLayer, (newVal) => {
  updateStructure(newVal);

  const renderer = structureRenderer.value;
  if (renderer) {
    renderer.setStructure(structure_l.value);
    renderer.updateStructureBuffers();
    interactiveCanvas.value?.redraw();
  }
});


watch(once_threeD, () => {
  updateStructure(currentLayer.value);

  const renderer = structureRenderer.value;
  renderer.setStructure(structure_l.value);
  renderer.updateStructureBuffers();
  interactiveCanvas.value?.redraw();
});

const destroyData = () => {
  console.log('clean')
  loading_threeD.value = false;
  layers.value = {};
  layerMap.clear();
  structure_l.value = undefined;
  size_l.value = undefined;
  camera_l.value = undefined;
  currentLayer.value = 0;
  structureRenderer.value = undefined;
  interactiveCanvas.value = undefined;
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

onBeforeUnmount(async () => {
  destroyData();
});
</script>

<template>
  <v-row no-gutters class="container">
    <v-col v-if="showMaterialList" cols="3">
      <v-container style="max-height: 100vh; overflow-y: auto;">
        <v-list lines="two" class="scrollable-list">
          <v-list-item v-for="(material, i) in materialOverview" :key="i" class="material-item d-flex justify-space-between">
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
              <v-chip size="small" color="blue" class="ml-2">
                <v-icon start icon="mdi-cube"></v-icon>
                {{ material.count }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>
      </v-container>

    </v-col>

    <v-col :cols="showMaterialList ? 9 : 12" style="height: 100vh; display: flex; justify-content: center; align-items: center; position: relative;">
      <canvas class="gpu-canvas" id="structure-display" width="1150" height="800"></canvas>

      <div class="top-controls">
        <v-btn
          :icon="showMaterialList ? 'mdi-chevron-left' : 'mdi-chevron-right'"
          variant="text"
          @click="showMaterialList = !showMaterialList"
          :title="showMaterialList ? $t('toolsThreeD.hideMaterialList') : $t('toolsThreeD.showMaterialList')"
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
      </div>

      <!-- 右侧滑块控制 -->
      <div class="slider-container">
        <input
            type="range"
            class="vertical-slider"
            v-model="currentLayer"
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

    </v-col>
  </v-row>
</template>

<style scoped>
.container {
  display: flex;
  height: 100vh;
  width: 100%;
}

.gpu-canvas {
  image-rendering: crisp-edges;
  touch-action: none;
  transform-style: preserve-3d;
  will-change: transform;
}

#structure-display {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 0 10px rgba(0,0,0,0.1);
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
  gap: 6px;
  z-index: 100;
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
  transition: background 0.3s ease;
}
.button-group {
  display: flex;
  gap: 16px;
  justify-content: center;
}
.material-item:hover {
  background: rgba(255, 152, 0, 0.15);
}

.selected-item {
  background: rgba(255, 152, 0, 0.3);
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
  z-index: 200;
  background: rgba(255, 255, 255, 0.95);
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