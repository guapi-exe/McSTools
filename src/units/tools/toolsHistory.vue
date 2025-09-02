<script setup lang="ts">
import {schematicTypeList} from "../../modules/schematics_data.ts";
import {computed, defineProps, ref} from "vue";
import {HistoryRecordData} from "../../modules/history_data.ts";
import dayjs from "dayjs";
import {Requirement} from "../../modules/requirements.ts";
import {getBlockIcon} from "../../modules/others.ts";
import {copySchematic} from "../../modules/copy_file.ts";

const props = defineProps<{
  data: HistoryRecordData | undefined,
}>()

const indexId = ref(0)

const parseDimensions = (sizeStr: string) => {
  const [length, width, height] = sizeStr.split(',').map(Number);
  return [`X${length}`, `Y${width}`, `Z${height}`]
};

const formatTime = (time: any) => {
  return dayjs(time).format('YYYY/MM/DD HH:mm')
}

const reversedSchematics = computed(() => {
  return [...props.data.schematic].reverse();
});

const reversedRequirements = computed(() => {
  return [...props.data.requirements].reverse();
});

export interface Different {
  id: string,
  zh_cn: string,
  num: number
}

const compareDialog = ref(false);
const currentDiff = ref<Array<{type: 'add' | 'remove' | 'change', data: Requirement}>>([]);

const generateDiff = (current: Requirement[], previous: Requirement[]) => {
  const diff: Array<{type: 'add' | 'remove' | 'change', data: Different}> = [];

  const prevMap = new Map(previous.map(r => [r.id, r]));
  const currMap = new Map(current.map(r => [r.id, r]));

  currMap.forEach((curr, id) => {
    const prev = prevMap.get(id);
    if (!prev) {
      diff.push({type: 'add', data: curr});
    } else if (prev.num !== curr.num) {
      curr.num = curr.num - prev.num
      if (curr.num > 0){
        diff.push({type: 'add', data: curr});
      }else {
        diff.push({type: 'remove', data: curr});
      }
    }
  });

  prevMap.forEach((prev, id) => {
    if (!currMap.has(id)) {
      diff.push({type: 'remove', data: prev});
    }
  });

  return diff;
};

const showDiff = (index: number) => {
  if (index < reversedSchematics.value.length - 1) {
    const current = reversedRequirements.value[index];
    const previous = reversedRequirements.value[index + 1];
    currentDiff.value = generateDiff(current, previous);
    compareDialog.value = true;
  }
};
</script>

<template>
  <v-row no-gutters
         class="mb-4"
  >
    <v-col>
      <v-timeline side="end" align="start" line-color="grey-lighten-2">
        <v-timeline-item
            v-for="(bp, index) in reversedSchematics"
            :key="bp.id"
            size="x-small"
            fill-dot
            icon="mdi-cube-scan"
            dot-color="info"
        >
          <template #opposite>
            <span class="text-caption text-grey-darken-1">{{ formatTime(bp.updated_at) }}</span>
          </template>

          <div class="d-flex justify-space-between align-start">
            <div class="flex-grow-1">
              <div class="d-flex align-center flex-wrap ga-2 mb-2">
                <span v-if="bp.schematic_type == -1" class="text-subtitle-1 text-red-lighten-1">未解析</span>
                <span class="text-h6 text-blue-darken-4">{{ bp.name }}</span>
                <v-chip
                    variant="outlined"
                    color="green-darken-2"
                    size="small"
                >
                  <v-icon start icon="mdi-account"></v-icon>
                  {{ bp.user }}
                </v-chip>
              </div>

              <div class="d-flex flex-wrap align-center ga-2 mb-2">
                <v-chip
                    color="orange-lighten-4"
                    size="small"
                    class="text-orange-darken-4"
                >
                  <v-icon start icon="mdi-cube"></v-icon>
                  {{ bp.game_version }}
                </v-chip>
                <v-chip
                    color="deep-purple"
                    variant="outlined"
                    size="small"
                    class="dimension-chip"
                >
                  <div class="d-flex align-center">
                    <v-icon icon="mdi-axis-arrow" class="mr-1"></v-icon>
                    <div class="dimension-values">
                            <span v-for="(dim, index) in parseDimensions(bp.sizes)" :key="index">
                              {{ dim }}
                              <v-icon v-if="index < 2" icon="mdi-close" size="x-small" class="mx-1"></v-icon>
                            </span>
                    </div>
                  </div>
                </v-chip>
              </div>

              <p class="text-caption text-grey-darken-2 mb-2">
                {{ bp.description }}
              </p>

              <div class="d-flex flex-wrap align-center ga-3">
                <div class="d-flex align-center">
                  <v-icon icon="mdi-format-list-bulleted-type" size="small" class="me-1"></v-icon>
                  <span class="text-caption">{{ schematicTypeList[bp.schematic_type as 1 | 2 | 3 | 4] }}</span>
                </div>
                <div class="d-flex align-center">
                  <v-icon icon="mdi-tag" size="small" class="me-1"></v-icon>
                  <span class="text-caption">v{{ bp.version }}</span>
                </div>
              </div>
            </div>

            <div class="d-flex flex-column align-center ga-2 ml-4">
              <v-btn
                  variant="tonal"
                  color="info"
                  prepend-icon="mdi-download"
                  size="small"
                  @click="copySchematic(bp.id, bp.sub_type, bp.version, bp.schematic_type)"
              >
                导出蓝图
              </v-btn>
              <div class="d-flex ga-1">
                <v-btn
                    variant="tonal"
                    color="green"
                    prepend-icon="mdi-compare-horizontal"
                    size="small"
                    @click.stop="showDiff(index); indexId = index"
                    :disabled="index >= reversedSchematics.length - 1"
                >
                  差异对比
                </v-btn>
              </div>
            </div>
          </div>
        </v-timeline-item>
      </v-timeline>
    </v-col>
  </v-row>
  <v-dialog v-model="compareDialog" max-width="1100" scrollable>
    <v-row class="h-100 ma-0" style="min-height: 70vh;">
      <v-col cols="12" sm="6" class="h-100">
        <v-card class="h-100 d-flex flex-column">
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-clock-time-eight-outline" class="mr-2"></v-icon>
            当前材料需求
          </v-card-title>
          <v-card-text class="flex-grow-1 overflow-y-auto" style="max-height: 100vh;">
            <v-list lines="two">
              <v-list-item
                  v-for="(item, i) in reversedRequirements[indexId]"
                  :key="i"
              >
                <template #prepend>
                  <v-avatar size="32" rounded="0" class="mr-2">
                    <img :src="getBlockIcon(item.id)" :alt="item.zh_cn">
                  </v-avatar>
                </template>
                <v-list-item-title>
                  {{ item.zh_cn }}
                  <v-chip
                      size="small"
                      color="orange-lighten-1"
                      class="ml-2"
                  >
                    <v-icon start icon="mdi-cube"></v-icon>
                    {{ item.num }}
                  </v-chip>
                </v-list-item-title>

                <v-list-item-subtitle>
                  {{ item.id }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" class="h-100">
        <v-card class="h-100 d-flex flex-column">
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-compare-horizontal" class="mr-2"></v-icon>
            材料需求差异对比
          </v-card-title>
          <v-card-text class="flex-grow-1 overflow-y-auto" style="max-height: 100vh;">
            <v-list lines="two">
              <v-list-item
                  v-for="(item, i) in currentDiff"
                  :key="i"
                  :class="{
                    'text-green-darken-2': item.type === 'add',
                    'text-red-darken-2': item.type === 'remove',
                  }"
              >
                <template #prepend>
                  <v-icon
                      size="26"
                      :icon="item.type === 'add' ? 'mdi-plus-circle'
                       : item.type === 'remove' ? 'mdi-minus-circle'
                       : item.data.num > 0  ? 'mdi-plus-circle'
                       : 'mdi-minus-circle'"
                  ></v-icon>
                  <v-avatar size="32" rounded="0" class="mr-2">
                    <img :src="getBlockIcon(item.data.id)" :alt="item.data.id">
                  </v-avatar>
                </template>

                <v-list-item-title>
                  {{ item.data.zh_cn }}
                  <v-chip
                      size="small"
                      color="orange-lighten-1"
                      class="ml-2"
                  >
                    <v-icon start :icon="item.type === 'add' ? 'mdi-plus'
                       : item.type === 'remove' ? 'mdi-minus'
                       : item.data.num > 0  ? 'mdi-plus'
                       : 'mdi-minus'"></v-icon>
                    {{ Math.abs(item.data.num) }}
                  </v-chip>
                </v-list-item-title>

                <v-list-item-subtitle>
                  {{ item.data.id }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-dialog>
</template>

<style scoped>
.v-timeline-item {
  min-height: 100px;
}

.dimension-values {
  display: inline-flex;
  align-items: center;
}
</style>