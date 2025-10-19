<script setup lang="ts">
import {computed, ref} from "vue";
import {schematic_id, schematicData} from "../../modules/tools_data.ts";
import {splitSchematicParts} from "../../modules/split_data.ts";
import {toast} from "../../modules/others.ts";
import { useI18n } from 'vue-i18n';
const { t: $t } = useI18n();
import JSZip from "jszip";
import { saveAs } from "file-saver";

const spiltType = ref(1);
const splitFiles = ref([]);
const loading = ref(false);
const splitNumber = ref(2)
const splitTypes = ref([
  {
    value: 1,
    label: $t('toolsSplit.verticalSplit')
  },
  {
    value: 2,
    label: $t('toolsSplit.horizontalSplit')
  },
  {
    value: 3,
    label: $t('toolsSplit.gridSplit')
  }
]);

const isSplitNumberDisabled = (num: number) => {
  if (!schematicData.value.sizes) return true;

  const [x, y, z] = schematicData.value.sizes.split(',').map(Number);

  if (spiltType.value === 1) {
    return x < num; // 垂直分层 → 宽度不足
  } else if (spiltType.value === 2) {
    return y < num; // 水平区域 → 高度不足
  } else if (spiltType.value === 3) {
    const sqrt = Math.sqrt(num);
    if (!Number.isInteger(sqrt)) return true; // 必须是平方数
    return x < sqrt || z < sqrt; // X 或 Y 尺寸不足
  }
  return true;
};
const parseDimensions = (sizeStr: string) => {
  const [length, width, height] = sizeStr.split(',').map(Number);
  return [`X${length}`, `Y${width}`, `Z${height}`]
};

const dimensionLabel = computed(() => {
  if (spiltType.value === 1) return $t('toolsSplit.lengthX');
  if (spiltType.value === 2) return $t('toolsSplit.widthY');
  if (spiltType.value === 3) return $t('toolsSplit.xz');
  return '';
});

const parseSplitDimensions = (sizeStr: string) => {
  const [length, width, height] = sizeStr.split(',').map(Number);

  if (spiltType.value === 1) {
    return [`X${Math.floor(length / splitNumber.value)}`, `Y${width}`, `Z${height}`];
  } else if (spiltType.value === 2) {
    return [`X${length}`, `Y${Math.floor(width / splitNumber.value)}`, `Z${height}`];
  } else if (spiltType.value === 3) {
    const sqrt = Math.sqrt(splitNumber.value);
    return [
      `X${Math.floor(length / sqrt)}`,
      `Y${width}`,
      `Z${Math.floor(height / sqrt)}`
    ];
  }

  return [`X${length}`, `Y${width}`, `Z${height}`];
};


const SplitDimensions = async () => {
  try {
    loading.value = true;
    splitFiles.value = await splitSchematicParts({
      schematicId: schematic_id.value,
      splitType: spiltType.value,
      splitNumber: splitNumber.value,
      vType: schematicData.value.schematic_type
    })
    console.log(splitFiles.value)
  }catch (e) {
  toast.error($t('toolsSplit.error', {error: String(e)}), {timeout: 3000});
  }finally {
    loading.value = false;
  }
}

const downloadFile = async (file: File) => {
  const url = URL.createObjectURL(file);

  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

const downloadAll = async () => {
  if (!splitFiles.value.length) return;

  const zip = new JSZip();

  splitFiles.value.forEach(file => {
    zip.file(file.file.name, file.file);
  });

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `schematic_parts_${Date.now()}.zip`);
};

</script>

<template>
  <v-row>
    <v-col cols="12" v-if="loading">
      <v-alert
          variant="tonal"
          color="blue"
          icon="mdi-information"
          class="mt-4"
      >
  {{$t('toolsSplit.splitAlert')}}
      </v-alert>
    </v-col>
  </v-row>

  <v-row class="pa-4" no-gutters>
    <v-col cols="4">
      <v-card class="pa-3" elevation="2">
        <v-select
            v-model="spiltType"
            label="分割方式"
            :items="splitTypes"
            item-title="label"
            item-value="value"
        />
        <v-col cols="12" class="d-flex align-center justify-center gap-2" style="padding: 0px !important;">
          <v-icon color="blue" class="mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 36 36"><path fill="#0284c7" d="m33.53 18.76l-6.93-3.19V6.43a1 1 0 0 0-.6-.9l-7.5-3.45a1 1 0 0 0-.84 0l-7.5 3.45a1 1 0 0 0-.58.91v9.14l-6.9 3.18a1 1 0 0 0-.58.91v9.78a1 1 0 0 0 .58.91l7.5 3.45a1 1 0 0 0 .84 0l7.08-3.26l7.08 3.26a1 1 0 0 0 .84 0l7.5-3.45a1 1 0 0 0 .58-.91v-9.78a1 1 0 0 0-.57-.91m-2.81.91L25.61 22l-5.11-2.33l5.11-2.35ZM18.1 4.08l5.11 2.35l-5.11 2.35L13 6.43Zm-7.5 13.23l5.11 2.35L10.6 22l-5.11-2.33Zm6.5 11.49l-6.5 3l-6.5-3v-7.57L10.18 24a1 1 0 0 0 .82 0l6.08-2.8Zm-5.5-13.23V8l6.08 2.8a1 1 0 0 0 .84 0L24.6 8v7.58l-6.5 3Zm20.51 13.24l-6.5 3l-6.51-3v-7.59L25.19 24a1 1 0 0 0 .81 0l6.08-2.8Z" class="clr-i-outline clr-i-outline-path-1"/><path fill="none" d="M0 0h36v36H0z"/></svg>
          </v-icon>
          <span>{{$t('toolsSplit.splitCount')}}</span>
          <v-btn-toggle
              v-model="splitNumber"
              color="info"
              class="d-flex align-center"
              v-if="spiltType == 3"
              mandatory
          >
            <v-btn
                :value="4"
                size="large"
                class="px-6"
                :disabled="isSplitNumberDisabled(4)"
            >
              <span class="font-weight-bold">4</span>
              <v-tooltip
                  v-if="isSplitNumberDisabled(4)"
                  activator="parent"
                  location="bottom"
              >
                {{$t('toolsSplit.originalSize')}}{{ dimensionLabel }}{{$t('toolsSplit.cannotSplit', {count: 4})}}
              </v-tooltip>
            </v-btn>

            <v-btn
                :value="9"
                size="large"
                class="px-6"
                :disabled="isSplitNumberDisabled(9)"
            >
              <span class="font-weight-bold">9</span>
              <v-tooltip
                  v-if="isSplitNumberDisabled(9)"
                  activator="parent"
                  location="bottom"
              >
                {{$t('toolsSplit.originalSize')}}{{ dimensionLabel }}{{$t('toolsSplit.cannotSplit', {count: 9})}}
              </v-tooltip>
            </v-btn>

            <v-btn
                :value="16"
                size="large"
                class="px-6"
                :disabled="isSplitNumberDisabled(16)"
            >
              <span class="font-weight-bold">16</span>
              <v-tooltip
                  v-if="isSplitNumberDisabled(16)"
                  activator="parent"
                  location="bottom"
              >
                {{$t('toolsSplit.originalSize')}}{{ dimensionLabel }}{{$t('toolsSplit.cannotSplit', {count: 16})}}
              </v-tooltip>
            </v-btn>

            <v-btn
                :value="25"
                size="large"
                class="px-6"
                :disabled="isSplitNumberDisabled(25)"
            >
              <span class="font-weight-bold">25</span>
              <v-tooltip
                  v-if="isSplitNumberDisabled(25)"
                  activator="parent"
                  location="bottom"
              >
                {{$t('toolsSplit.originalSize')}}{{ dimensionLabel }}{{$t('toolsSplit.cannotSplit', {count: 25})}}
              </v-tooltip>
            </v-btn>
          </v-btn-toggle>

          <v-btn-toggle
              v-model="splitNumber"
              color="info"
              class="d-flex align-center"
              v-else
              mandatory
          >
            <v-btn
                :value="2"
                size="large"
                class="px-6"
                :disabled="isSplitNumberDisabled(2)"
            >
              <span class="font-weight-bold">2</span>
              <v-tooltip
                  v-if="isSplitNumberDisabled(2)"
                  activator="parent"
                  location="bottom"
              >
                {{$t('toolsSplit.originalSize')}}{{ dimensionLabel }}{{$t('toolsSplit.cannotSplit', {count: 2})}}
              </v-tooltip>
            </v-btn>

            <v-btn
                :value="4"
                size="large"
                class="px-6"
                :disabled="isSplitNumberDisabled(4)"
            >
              <span class="font-weight-bold">4</span>
              <v-tooltip
                  v-if="isSplitNumberDisabled(4)"
                  activator="parent"
                  location="bottom"
              >
                {{$t('toolsSplit.originalSize')}}{{ dimensionLabel }}{{$t('toolsSplit.cannotSplit', {count: 4})}}
              </v-tooltip>
            </v-btn>

            <v-btn
                :value="8"
                size="large"
                class="px-6"
                :disabled="isSplitNumberDisabled(8)"
            >
              <span class="font-weight-bold">8</span>
              <v-tooltip
                  v-if="isSplitNumberDisabled(8)"
                  activator="parent"
                  location="bottom"
              >
                {{$t('toolsSplit.originalSize')}}{{ dimensionLabel }}{{$t('toolsSplit.cannotSplit', {count: 8})}}
              </v-tooltip>
            </v-btn>

            <v-btn
                :value="16"
                size="large"
                class="px-6"
                :disabled="isSplitNumberDisabled(16)"
            >
              <span class="font-weight-bold">16</span>
              <v-tooltip
                  v-if="isSplitNumberDisabled(16)"
                  activator="parent"
                  location="bottom"
              >
                {{$t('toolsSplit.originalSize')}}{{ dimensionLabel }}{{$t('toolsSplit.cannotSplit', {count: 16})}}
              </v-tooltip>
            </v-btn>
          </v-btn-toggle>
        </v-col>
        <v-btn
            block
            color="green"
            prepend-icon="mdi-axe"
            @click="SplitDimensions"
            :loading="loading"
  >{{$t('toolsSplit.executeSplit')}}</v-btn>
      </v-card>
    </v-col>

    <v-col cols="8">
      <v-card class="h-100" elevation="2">
        <v-container>
          <v-row>
            <v-col cols="6">
              <div class="text-body-2 text-grey-darken-1 mb-1">{{$t('toolsSplit.originalSize')}}</div>
              <v-chip
                  color="deep-purple"
                  variant="outlined"
                  size="large"
                  class="dimension-chip pa-3"
              >
                <div class="d-flex align-center">
                  <v-icon icon="mdi-axis-arrow" class="mr-1"></v-icon>
                  <div class="dimension-values">
                    <span v-for="(dim, index) in parseDimensions(schematicData.sizes)" :key="index">
                      {{ dim }}
                      <v-icon v-if="index < 2" icon="mdi-close" size="x-small" class="mx-1"></v-icon>
                    </span>
                  </div>
                </div>
              </v-chip>
            </v-col>

            <v-col cols="6">
              <div class="text-body-2 text-grey-darken-1 mb-1">{{$t('toolsSplit.splitSize')}}</div>
              <v-chip
                  color="green"
                  variant="outlined"
                  size="large"
                  class="dimension-chip pa-3"
              >
                <div class="d-flex align-center">
                  <v-icon icon="mdi-ruler" class="mr-1"></v-icon>
                  <div class="dimension-values">
                    <span v-for="(dim, index) in parseSplitDimensions(schematicData.sizes)" :key="index">
                      {{ dim }}
                      <v-icon v-if="index < 2" icon="mdi-close" size="x-small" class="mx-1"></v-icon>
                    </span>
                  </div>
                </div>
              </v-chip>
            </v-col>

            <v-col cols="12" class="mt-4">
              <v-card v-if="splitFiles.length > 0" class="elevation-1">
                <v-toolbar color="blue-lighten-5" density="compact">
                  <v-toolbar-title>{{$t('toolsSplit.splitResult')}}</v-toolbar-title>
                  <v-spacer></v-spacer>
                  <v-btn
                      color="green"
                      variant="tonal"
                      size="small"
                      class="ml-2"
                      @click="downloadAll"
                  >
                    <v-icon left>mdi-archive</v-icon>
                    {{$t('toolsSplit.downloadAll')}}
                  </v-btn>
                  <v-chip color="green" variant="tonal" size="small">
                    {{ splitFiles.length }} {{$t('toolsSplit.file')}}
                  </v-chip>
                </v-toolbar>

                <v-list density="comfortable">
                  <v-list-item v-for="(file, index) in splitFiles" :key="index" class="border-b">
                    <template v-slot:prepend>
                      <v-icon class="mr-3" color="blue-darken-2">mdi-file</v-icon>
                    </template>

                    <v-list-item-title>
                      <span class="font-weight-medium">{{ file.name }}</span>
                    </v-list-item-title>

                    <v-list-item-subtitle>
                      <div class="d-flex align-center">
                        <v-icon size="small" class="mr-1">mdi-ruler</v-icon>
                        <span>{{ file.size }}</span>
                      </div>
                    </v-list-item-subtitle>

                    <v-list-item-subtitle class="d-flex align-center">
                      <v-icon size="small" class="mr-1">mdi-identifier</v-icon>
                      <span>{{ file.index }}</span>
                    </v-list-item-subtitle>

                    <template v-slot:append>
                      <v-btn color="info" variant="tonal" size="small" @click="downloadFile(file.file)">
                        <v-icon left>mdi-download</v-icon>
                        {{$t('toolsSplit.download')}}
                      </v-btn>
                    </template>
                  </v-list-item>
                </v-list>
              </v-card>

              <v-card v-else class="elevation-0 text-center py-10 bg-grey-lighten-4">
                <v-icon size="x-large" color="grey" class="mb-3">mdi-file-arrow-left-right-outline</v-icon>
                <div class="text-h6 text-grey-darken-1">{{$t('toolsSplit.splitResultHint')}}</div>
                <div class="text-body-1 text-grey mt-2">{{$t('toolsSplit.splitButtonHint')}}</div>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </v-card>
    </v-col>
  </v-row>


</template>

<style scoped>
.dimension-chip {
  width: 100%;
  justify-content: start;
}

.v-list-item {
  transition: all 0.3s ease;
}

.v-list-item:hover {
  background-color: #f5f7ff;
}

.border-b {
  border-bottom: 1px solid #eee;
}
</style>