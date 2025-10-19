<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {
  Structure, StructureRenderer,
} from "deepslate";
import {InteractiveCanvas} from "../../modules/deepslateInit.ts";
import {fetchSchematicData} from "../../modules/schematic_data.ts";
import {schematic_id, schematicData} from "../../modules/tools_data.ts";
import {blocks_resources} from "../../modules/deepslateInit.ts";
import {getBlockIcon, toast} from "../../modules/others.ts";
import {layers, layerMap, currentLayer, camera_l, interactiveCanvas, size_l, loading_threeD, once_threeD, structure_l, structureRenderer} from "../../modules/threeD_data.ts"
import { useI18n } from 'vue-i18n';
const { t: $t } = useI18n();
const materialOverview = ref<{id: string, name: string, count: number}[]>([]);
const progress = ref(0)
const sureLoading = ref<boolean>(false);
const loadStructure = async () => {
  const schematic_data = await fetchSchematicData(schematic_id.value)
  const schematic_size = schematic_data.size
  const structure = new Structure([schematic_size.width, schematic_size.height, schematic_size.length])
  const blocks = schematic_data.blocks
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
  const structureCanvas = document.getElementById('structure-display') as HTMLCanvasElement
  const structureGl = structureCanvas.getContext('webgl')!
  if (interactiveCanvas.value) {
    camera_l.value = {
      xRotation: (interactiveCanvas.value as any).xRotation,
      yRotation: (interactiveCanvas.value as any).yRotation,
      viewDist: (interactiveCanvas.value as any).viewDist
    }
  }
  structureRenderer.value = new StructureRenderer(structureGl, structure_l.value, blocks_resources.value, {
    facesPerBuffer: 1000,
    chunkSize: 16,
    useInvisibleBlockBuffer: false}
  )

  interactiveCanvas.value = new InteractiveCanvas(structureCanvas,camera_l.value, view => {
    structureRenderer.value.drawStructure(view)
    structureRenderer.value.drawGrid(view)
  }, [size_l.value[0] / 2, size_l.value[1] / 2, size_l.value[2] / 2])
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
  reloadRenderer();
});

watch(once_threeD, () => {
  updateStructure(currentLayer.value);
  reloadRenderer();
});
const destroyData = () => {
  if (loading_threeD.value) {
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
}

onBeforeUnmount(async () => {
  destroyData();
})
</script>

<template>
  <v-row no-gutters class="container">
    <v-col cols="3">
      <v-container style="max-height: 100vh; overflow-y: auto;">
        <v-list lines="two" class="scrollable-list">
          <v-list-item v-for="(material, i) in materialOverview" :key="i" class="material-item d-flex justify-space-between">
            <template #prepend>
              <v-avatar size="40" rounded="0" class="mr-2 avatar-bg">
                <img :src="getBlockIcon(material.id)" :alt="material.id">
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

    <v-col cols="9" style="height: 100vh; display: flex; justify-content: center; align-items: center;">
      <canvas class="gpu-canvas" id="structure-display" width="1150" height="800"></canvas>

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
  background: rgba(255, 152, 0, 0.15); /* 悬停效果 */
}

.selected-item {
  background: rgba(255, 152, 0, 0.3); /* 选中状态 */
  font-weight: bold;
}

.avatar-bg {
  background: rgba(30, 30, 30, 0.2); /* 头像背景 */
}

.material-name {
  font-size: 1rem;
  font-weight: bold;
}

.material-info {
  font-size: 0.85rem;
  color: #888;
}
</style>