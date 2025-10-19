<script setup lang="ts">
import {computed, onBeforeMount, onMounted, reactive, ref} from "vue";
import {mapArtData} from "../../modules/map_art/map_art_data.ts"
import {getBlockImg, toast} from "../../modules/others.ts";
import {encode_image, image_data} from "../../modules/map_art/encode_image.ts";
import {MapArtProcessor} from "../../modules/map_art/image_rebuild.ts";
const exportSettings = reactive({
  width: 128,
  height: 128,
  dithering: true,
  maxResolution: 4096,
  schematic_type: 1,
  sub_type: -1,
  axios: 'y',
  targetRotation: 0
});
const replaceAir = ref(false)
const schematicType = ref()
const subType = ref()
const schematicTypes = ref([
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
      { value: -1, label: 'Litematica格式' }
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
])
const hasImage = ref(false)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const resize = ref(1)
const isProcessing = ref(false)
const exportLoading = ref(false)
const exportImageLoading = ref(false)
const dialog = ref(false)
const selectedBlocks = ref<string[]>([]);
const expandedCategories = ref<string[]>([])
const imageBuild = ref<MapArtProcessor>();
const mapImg = ref<File>();
const finallyImage = ref<HTMLCanvasElement>()
const threeD = ref<boolean>()
const maxZ = ref(60)
const previewImage = ref<string>("");
const blocksLoaded = ref(false);
const toggleBlock = (blockId: string) => {
  const index = selectedBlocks.value.indexOf(blockId)
  if (index === -1) {
    selectedBlocks.value.push(blockId)
  } else {
    selectedBlocks.value.splice(index, 1)
  }
}
const toggleCategory = async (categoryName: string) => {
  const category = mapArtData.value.find(c => c.name === categoryName)
  if (!category) return

  const allSelected = category.items.every(item =>
      selectedBlocks.value.includes(item.id)
  )

  if (allSelected) {
    selectedBlocks.value = selectedBlocks.value.filter(
        id => !category.items.some(item => item.id === id)
    )
  } else {
    const newItems = category.items
        .filter(item => !selectedBlocks.value.includes(item.id))
        .map(item => item.id)
    selectedBlocks.value = [...selectedBlocks.value, ...newItems]
  }
}
const currentSubTypes = computed(() => {
  const mainType = schematicTypes.value.find(
      t => t.value === exportSettings.schematic_type
  )
  return mainType?.subtypes || []
})
const onMainTypeChange = (data: any) => {
  exportSettings.schematic_type = data.value
  if (currentSubTypes.value.length > 0) {
    exportSettings.sub_type = currentSubTypes.value[0].value
    subType.value = data.subtypes[0]
  }
}
const onSubTypeChange = (data: any) => {
  exportSettings.sub_type = data.value
}
const isCategorySelected = (categoryName: string) => {
  const category = mapArtData.value.find(c => c.name === categoryName)
  return category?.items.every(item =>
      selectedBlocks.value.includes(item.id)
  ) ?? false
}
const refreshImage = async () => {
  try {
    isProcessing.value = true
    hasImage.value = true
    imageBuild.value.updateBlocksData(selectedBlocks.value)
    const resultCanvas = await imageBuild.value.generatePixelArt(image_data.value.image, 16, {width: exportSettings.width, height:exportSettings.height}, exportSettings.dithering, replaceAir.value, exportSettings.targetRotation as 0 | 90 | 180| 270);
    finallyImage.value = resultCanvas
    const ctx = previewCanvas.value.getContext('2d')
    if (!ctx) return

    previewCanvas.value.width = resultCanvas.width
    previewCanvas.value.height = resultCanvas.height

    ctx.drawImage(resultCanvas, 0, 0)
  }catch (error) {
    toast.error(`像素画预览生成失败:${error}`, {
      timeout: 3000
    });
  } finally {
    isProcessing.value = false
  }
}
const uploadImage = async(file: File | undefined) => {
  try {
    isProcessing.value = true
    hasImage.value = true
    image_data.value = await encode_image(file);
    exportSettings.height = Math.round(image_data.value.height)
    exportSettings.width = Math.round(image_data.value.width)
    if (exportSettings.height*16 * exportSettings.width*16 >= 16384* 16384) resize.value = 0.5
    imageBuild.value.updateBlocksData(selectedBlocks.value)
    await updateSize()
    const resultCanvas = await imageBuild.value.generatePixelArt(image_data.value.image, 16, {width: exportSettings.width, height:exportSettings.height}, exportSettings.dithering, replaceAir.value, exportSettings.targetRotation as 0 | 90 | 180| 270);
    finallyImage.value = resultCanvas
    const ctx = previewCanvas.value.getContext('2d')
    if (!ctx) return

    previewCanvas.value.width = resultCanvas.width
    previewCanvas.value.height = resultCanvas.height

    ctx.drawImage(resultCanvas, 0, 0)
  } catch (error) {
    toast.error(`像素画预览生成失败:${error}`, {
      timeout: 3000
    });
  } finally {
    isProcessing.value = false
  }
}
const updateSize = async() => {
  exportSettings.width = Math.round(image_data.value.width * resize.value);
  exportSettings.height = Math.round(image_data.value.height * resize.value)
}
const exportSchematicData = async() => {
  exportLoading.value = true
  try {
    let result = await imageBuild.value.exportSchematic(
        image_data.value.image,
        image_data.value.name,
        exportSettings.schematic_type,
        exportSettings.sub_type,
        {width: exportSettings.width, height:exportSettings.height},
        exportSettings.targetRotation as 0 | 90 | 180| 270,
        exportSettings.dithering,
        replaceAir.value,
        threeD.value,
        maxZ.value,
        exportSettings.axios as 'x' | 'y' | 'z'
    )
    if (result){
      toast.success(`已成功导出蓝图可前往仓库查看`, {
        timeout: 3000
      });
      dialog.value = false
    }
  }catch (err) {
    toast.error(`导出失败:${err}`, {
      timeout: 3000
    });
  }finally {
    exportLoading.value = false
  }
}

const exportImage = async() => {
  exportImageLoading.value = true
  try {
    let canvas = finallyImage.value
    const dataUrl = canvas.toDataURL('image/png');

    const link = document.createElement('a');
    link.download = 'result.png';
    link.href = dataUrl;
    link.click();
  }catch (err) {
    toast.error(`导出失败:${err}`, {
      timeout: 3000
    });
  }finally {
    exportImageLoading.value = false
  }
}
onMounted(async () => {
  setTimeout(() => {
    blocksLoaded.value = true;
  }, 100);
  await toggleCategory("wool")
  imageBuild.value = new MapArtProcessor(mapArtData.value, selectedBlocks.value)

})
const cleanImage = async() => {
  image_data.value = undefined;
  hasImage.value = false;
  const canvas = previewCanvas.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
onBeforeMount(async() => {
  await cleanImage()
  imageBuild.value = undefined
})

</script>

<template>
  <v-row no-gutters class="mx-auto v-theme--custom text-primary">
    <v-col cols="12" md="4" class="pa-4 d-flex flex-column text-medium-emphasis">
      <v-row v-if="image_data != undefined">
        <v-col cols="12" class="image-column" >
          <v-img
              :aspect-ratio="16/9"
              :style="{
                    backgroundImage: `url(${image_data.base64})`,
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
        <v-img
            v-else
            :src="previewImage"
            :max-height="300"
            contain
            class="mb-4 elevation-2 rounded"
        ></v-img>
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

        <v-switch
            class="ml-4"
            v-model="exportSettings.dithering"
            :label="$t('mapImage2d.enableDithering')"
            color="info"
            density="compact"
            :hint="$t('mapImage2d.ditheringHint')"
            persistent-hint
        >
          <template v-slot:append>
            <v-tooltip location="bottom">
              <template v-slot:activator="{ props }">
                <v-icon
                    v-bind="props"
                    icon="mdi-information-outline"
                    size="small"
                    class="ml-2"
                ></v-icon>
              </template>
              <span>{{$t('mapImage2d.ditheringTooltip')}}</span>
            </v-tooltip>
          </template>
        </v-switch>

        <v-switch
            class="ml-4"
            v-model="replaceAir"
            :label="$t('mapImage2d.airBlock')"
            color="info"
            density="compact"
            :hint="$t('mapImage2d.airBlockHint')"
            persistent-hint
        >
          <template v-slot:append>
            <v-tooltip location="bottom">
              <template v-slot:activator="{ props }">
                <v-icon
                    v-bind="props"
                    icon="mdi-information-outline"
                    size="small"
                    class="ml-2"
                ></v-icon>
              </template>
              <span>{{$t('mapImage2d.airBlockTooltip')}}</span>
            </v-tooltip>
          </template>
        </v-switch>
      </div>
      <v-btn
          variant="outlined"
          block
          color="blue"
          @click="refreshImage"
      >
        <v-icon left>mdi-refresh</v-icon>
  {{$t('mapImage2d.refresh')}}
      </v-btn>

      <v-btn
          :disabled="!hasImage"
          variant="outlined"
          block
          color="green"
          @click="dialog = true;"
      >
        <v-icon left>mdi-download</v-icon>
  {{$t('mapImage2d.exportSchematic')}}
      </v-btn>
      <v-btn
          :disabled="!hasImage"
          variant="outlined"
          block
          color="green"
          :loading="exportImageLoading"
          @click="exportImage"
      >
        <v-icon left>mdi-download</v-icon>
  {{$t('mapImage2d.exportImage')}}
      </v-btn>
      <v-card v-if="blocksLoaded">
        <v-toolbar density="compact">
          <v-toolbar-title>{{$t('mapImage2d.blockSelector')}}</v-toolbar-title>
        </v-toolbar>

        <v-list style="height: 80vh">
          <v-list-group
              v-for="category in mapArtData"
              :key="category.name"
              v-model="expandedCategories"
              :value="category.name"
          >
            <template v-slot:activator="{ props }">
              <v-list-item
                  v-bind="props"
                  :title="category.zh_cn"
                  class="category-header"

              >
                <template v-slot:prepend>
                  <v-checkbox
                      :model-value="isCategorySelected(category.name)"
                      color="info"
                      hide-details
                      @click="toggleCategory(category.name)"
                  ></v-checkbox>
                  <v-icon icon="mdi-cube-scan"></v-icon>
                </template>
              </v-list-item>
            </template>

            <v-list-item
                v-for="block in category.items"
                :key="block.id"
                class="block-item"
                @click="toggleBlock(block.id)"
                style="padding-inline-start: 0 !important;"
            >
              <template v-slot:prepend>
                <v-checkbox
                    :model-value="selectedBlocks.includes(block.id)"
                    color="info"
                    hide-details
                ></v-checkbox>
              </template>
              <v-row align="start" no-gutters>
                <v-col cols="2" class="d-flex justify-center mt-2">
                  <v-avatar
                      size="28"
                      rounded="0"
                      class="mr-2"
                      style="border: 1px solid rgba(0,0,0,0.1)"
                  >
                    <v-img
                        :src="getBlockImg(block.id)"
                        :lazy-src="getBlockImg(block.id)"
                        :alt="block.id"
                        style="
                        width: 100%;
                        height: 100%;
                        object-fit: contain;
                        image-rendering: crisp-edges;
                      "
                    />
                  </v-avatar>
                </v-col>

                <v-col cols="6">
                  <div class="text-body-1 font-weight-bold">{{ block.zh_cn }}</div>
                  <div class="text-caption text-grey">{{ block.id }}</div>
                </v-col>

                <v-col cols="4">
                  <v-chip
                      class="ma-1"
                      label
                  >
                    <v-avatar
                        :color="block.average_rgb_hex"
                        size="20"
                        class="mr-1"
                    ></v-avatar>
                    <span>{{ block.average_rgb_hex }}</span>
                  </v-chip>
                </v-col>
              </v-row>
            </v-list-item>
          </v-list-group>
        </v-list>
      </v-card>

    </v-col>

    <v-col cols="12" md="8" class="pa-4 d-flex flex-column">
      <div class="preview-container elevation-3 rounded-lg">
        <div v-if="isProcessing" class="processing-overlay">
          <v-progress-circular
              indeterminate
              size="64"
              color="info"
          ></v-progress-circular>
          <div class="text-caption mt-2">{{$t('mapImage2d.processingImage')}}</div>
        </div>

        <div class="preview-content">
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

    </v-col>
  </v-row>
  <v-dialog
      v-model="dialog"
      max-width="500"
      persistent
  >
    <v-card
        max-width="500"
        width="500"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon icon="mdi-history" class="mr-2"></v-icon>
  {{$t('mapImage2d.exportSchematic')}}
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
  {{$t('mapImage2d.exportToType')}}
      </v-card-subtitle>
      <v-card-text>
        <v-row no-gutters>
          <v-col cols="12" class="pr-2">
            <v-combobox
                v-model="schematicType"
                :items="schematicTypes"
                item-title="label"
                item-value="value"
                return-object
                density="compact"
                :label="$t('mapImage2d.mainType')"
                @update:modelValue="v => onMainTypeChange(v)"
            ></v-combobox>
          </v-col>

          <v-col cols="12" class="pl-2">
            <v-combobox
                v-model="subType"
                :items="currentSubTypes"
                :disabled="!exportSettings.schematic_type"
                item-title="label"
                item-value="value"
                density="compact"
                :label="$t('mapImage2d.subType')"
                @update:modelValue="v => onSubTypeChange(v)"
            ></v-combobox>
          </v-col>
          <v-col cols="12" class="d-flex align-center justify-center gap-2" style="padding: 0 !important;">
            <span>{{$t('mapImage2d.axisOrientation')}}</span>
            <v-icon color="blue" icon="mdi-axis-arrow" class="mt-1"></v-icon>
            <v-btn-toggle
                v-model="exportSettings.axios"
                color="info"
                class="d-flex align-center"
                mandatory
            >
              <v-btn :value="'x'" size="large" class="px-6">
                <span class="font-weight-bold">X</span>
              </v-btn>
              <v-btn :value="'y'" size="large" class="px-6">
                <span class="font-weight-bold">Y</span>
              </v-btn>
              <v-btn :value="'z'" size="large" class="px-6">
                <span class="font-weight-bold">Z</span>
              </v-btn>
            </v-btn-toggle>
          </v-col>
          <v-col  cols="12" class="d-flex align-center justify-center gap-2" style="padding: 0 !important;">
            <v-switch
                class="ml-4"
                v-model="threeD"
                label="导出立体地图画"
                color="info"
                density="compact"
                hint="再地图上表现更加细节"
                persistent-hint
            >
              <template v-slot:append>
                <v-tooltip location="bottom">
                  <template v-slot:activator="{ props }">
                    <v-icon
                        v-bind="props"
                        icon="mdi-information-outline"
                        size="small"
                        class="ml-2"
                    ></v-icon>
                  </template>
                  <span>建筑难度高并且请勿选取重力方块</span>
                </v-tooltip>
              </template>
            </v-switch>
          </v-col>

          <v-col  cols="12" class="d-flex align-center justify-center gap-2" style="padding: 0 !important;">
            <v-number-input :disabled="!threeD" v-model="maxZ" :precision="0" hide-details="auto"></v-number-input>
            <code class="d-block pt-3">{{$t('mapImage2d.max3dHeight')}}: {{ maxZ }}</code>
          </v-col>
        </v-row>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
  <v-btn @click="dialog = false">{{$t('mapImage2d.cancel')}}</v-btn>
    <v-btn
      :disabled="schematicType == null"
      class="ms-auto"
      color="info"
      :loading="exportLoading"
      @click="exportSchematicData"
    >{{$t('mapImage2d.confirmExport')}}</v-btn>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.preview-container {
  display: inline-block;
  position: relative;
  background: repeating-conic-gradient(#f5f5f5 0% 25%, white 0% 50%) 50% / 20px 20px;
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
  transition: opacity 0.3s ease;
}
</style>