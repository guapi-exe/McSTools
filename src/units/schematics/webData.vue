<script setup lang="ts">

import {schematicTypeListWeb} from "../../modules/schematics_data.ts";
import {nextTick, ref, watch} from "vue";
import dayjs from "dayjs";
import {fetchMcSchematics, McSchematicData} from "../../modules/web_schematic/mcschematic_data.ts";
import {CMSchematicData, performSearch} from "../../modules/web_schematic/get_cms.ts";
import {selectedSite} from "../../modules/web_schematic/web_data.ts";
import { fetch } from '@tauri-apps/plugin-http';
import bgImg from '../../static/img/bg.jpg'
import createImg from '../../static/img/create.jpg'
import lmImg from '../../static/img/Litematica.jpg'
import weImg from '../../static/img/wordEdit.png'
import beImg from '../../static/img/grass_block.png'
import cogImg from '../../static/img/cog.png'
import {openLink, toast} from "../../modules/others.ts";
import {files, handleUpload} from "../../modules/upload_schematic.ts";
import {useI18n} from "vue-i18n";

const autoPage_MCS = ref(0)
const autoPage_CMS = ref(0)
const hasMore_MCS = ref(true);
const hasMore_CMS = ref(true);
const loadState_MCS = ref();
const loadState_CMS = ref();
const isLoading_MCS = ref(false);
const isLoading_CMS = ref(false);
const downLoading_MCS = ref(false)
let schematics_MCS = ref<McSchematicData[]>([])
const filterPanel = ref<InstanceType<typeof HTMLElement> | null>(null);
let schematics_CMS = ref<CMSchematicData[]>([])
const { t: $t } = useI18n();
const filters_MCS = ref({
  keyword: '',
  type: 0,
  sortBy: false
})

const filters_CMS = ref({
  filter: '',
  sort: 'time',
  sortType: 'down'
})
const blueprintTypes_CMS = ref([
  { text: '逆向排序', value: 'down' },
  { text: '正向排序', value: 'up' }
])
const typeLabels_CMS: Record<string, string> = {
  'down': '逆向排序',
  'up': '正向排序',
}
const sortOptions_CMS = ref([
  { text: '发布日期', value: 'time' },
  { text: '产量', value: 'speed' },
  { text: '下载量', value: 'download' },
])
const getSortLabel_CMS: Record<string, string> ={
  'time': '发布日期',
  'speed': '产量',
  'download': '下载量',
}
const blueprintTypes_MCS = ref([
  { text: '公开蓝图', value: 0 },
  { text: '优选蓝图', value: 1 }
])

const sortOptions_MCS = ref([
  { text: '时间排序', value: false },
  { text: '热度排序', value: true },
])
const getSortLabel_MCS = (value: boolean) => {
  return value ? '热度排序' : '时间排序'
}
const panelExpanded_MCS = ref(false)
const panelExpanded_CMS = ref(false)
const typeLabels_MCS: Record<number, string> = {
  0: '公开蓝图',
  1: '优选蓝图',
}
const IMAGE_MAPPING: Record<number, string> = {
  0: createImg,
  1: lmImg,
  2: bgImg,
  3: weImg,
  4: beImg
};
const fileExt: Record<number, string> = {
  0: 'nbt',
  1: 'litematic',
  2: 'json',
  3: 'schem',
  4: 'mcstruct'
};
const parseDimensions = (sizeStr: string) => {
  let data = JSON.parse(sizeStr)
  return [`${data[0]}`, `${data[1]}`, `${data[2]}`];
};
const parseDimensions_CMS = (sizeStr: string) => {
  const [length, width, height] = sizeStr.split('✖').map(Number);
  return [`${length}`, `${width}`, `${height}`]
};
interface LoadParams {
  done: (status: 'ok' | 'error' | 'empty') => void
}
const schematic_load_MCS = async ({ done }: LoadParams) => {
  loadState_MCS.value = done
  if (!hasMore_MCS.value) {
    done('empty')
    return
  }
  if (!hasMore_MCS.value) return;
  try {
    isLoading_MCS.value = true;

    const data = await fetchMcSchematics({
      filter: filters_MCS.value.keyword,
      page: autoPage_MCS.value,
      sort: filters_MCS.value.sortBy,
      type: filters_MCS.value.type
    });

    schematics_MCS.value = [...schematics_MCS.value, ...data];
    autoPage_MCS.value += 1;

    hasMore_MCS.value = data.length >= 15;
    done('ok')
  } catch (error) {
    toast.error(`加载失败:${error}`, {
      timeout: 3000
    });
    console.error('加载失败:', error);
    done('error')
  } finally {
    isLoading_MCS.value = false;
  }
}
const downloadAndUpload =async  (uuid: string, type:number) => {
  try {
    downLoading_MCS.value = true
    const url = `https://www.mcschematic.top/api/schematicFile?uuid=${uuid}`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }

    const filename = `${uuid}.${fileExt[type]}`

    const blob = await response.blob()
    const file = new File([blob], filename, {
      type: response.headers.get('content-type') || 'application/octet-stream',
      lastModified: Date.now()
    })

    files.value = [...files.value, file]
    await handleUpload(-1)
    return file
  } catch (error) {
    toast.error(`文件下载失败:${error}`, {
      timeout: 3000
    });
    console.error('文件下载失败:', error)
    throw error
  } finally {
    downLoading_MCS.value = false
  }
}
const schematic_load_CMS = async ({ done }: LoadParams) => {
  loadState_CMS.value = done
  if (!hasMore_CMS.value) {
    done('empty')
    return
  }
  if (!hasMore_CMS.value) return;

  try {
    isLoading_CMS.value = true;

    const data = await performSearch({
      filter: filters_CMS.value.filter,
      page: autoPage_CMS.value,
      order: filters_CMS.value.sortType as "down" | "up",
      sort: filters_CMS.value.sort as "time" | "download" | "speed"
    },{
          parseHTML: true
        }
    );
    const schematic = data.data as CMSchematicData[]
    schematics_CMS.value = [...schematics_CMS.value, ...schematic ];
    autoPage_CMS.value += 1;

    hasMore_CMS.value = schematic.length == 20;
    done('ok')
  } catch (error) {
    toast.error(`加载失败:${error}`, {
      timeout: 3000
    });
    console.error('加载失败:', error);
    done('error')
  } finally {
    isLoading_CMS.value = false;
  }
}
const reload_CMS = async () => {
  autoPage_CMS.value = 0;
  hasMore_CMS.value = true;
  isLoading_CMS.value = false;
  schematics_CMS.value = []
  if (!hasMore_CMS.value) {
    return
  }
  if (!hasMore_CMS.value || isLoading_CMS.value) return;

  try {
    isLoading_CMS.value = true;

    const data = await performSearch({
          filter: filters_CMS.value.filter,
          page: autoPage_CMS.value,
          order: filters_CMS.value.sortType as "down" | "up",
          sort: filters_CMS.value.sort as "time" | "download" | "speed"
        },{
          parseHTML: true
        }
    );
    const schematic = data.data as CMSchematicData[]
    schematics_CMS.value = [...schematics_CMS.value, ...schematic ];
    autoPage_CMS.value += 1;

    hasMore_CMS.value = schematic.length == 20;
    if (!hasMore_CMS.value) loadState_CMS.value('empty')
    else loadState_CMS.value('ok');
  } catch (error) {
    toast.error(`加载失败:${error}`, {
      timeout: 3000
    });
    console.error('加载失败:', error);
  } finally {
    isLoading_CMS.value = false;
  }
}
const reload_MCS = async () => {
  autoPage_MCS.value = 0
  hasMore_MCS.value = true;
  isLoading_MCS.value = false;
  loadState_MCS.value('ok');
  schematics_MCS.value = []
  if (!hasMore_MCS.value) {
    return
  }
  if (!hasMore_MCS.value || isLoading_MCS.value) return;

  try {
    isLoading_MCS.value = true;

    const data = await fetchMcSchematics({
      filter: filters_MCS.value.keyword,
      page: autoPage_MCS.value,
      sort: filters_MCS.value.sortBy,
      type: filters_MCS.value.type
    });

    schematics_MCS.value = [...schematics_MCS.value, ...data];
    autoPage_MCS.value += 1;

    hasMore_MCS.value = data.length == 15;
    if (!hasMore_MCS.value) loadState_MCS.value('empty')
    else loadState_MCS.value('ok');
  } catch (error) {
    toast.error(`加载失败:${error}`, {
      timeout: 3000
    });
    console.error('加载失败:', error);
  } finally {
    isLoading_MCS.value = false;
  }
}
const formatTime = (time: any) => {
  return dayjs(time).format('YYYY/MM/DD HH:mm')
}
const getMcSchematicPreview = (uuid: string) => {
  return `https://www.mcschematic.top/api/preview?uuid=${uuid}`
}
const handleScroll = () => {

  if (!panelExpanded_MCS.value || !panelExpanded_CMS.value) {
    panelExpanded_MCS.value = false; // 折叠
    panelExpanded_CMS.value = false; // 折叠
  }
}
watch(
    [
      () => filters_MCS.value.keyword,
      () => filters_MCS.value.sortBy,
      () => filters_MCS.value.type,
    ],
    async () => {
      await nextTick()
      await reload_MCS()
    },
    { flush: 'post' }
)
watch(
    [
      () => filters_CMS.value.filter,
      () => filters_CMS.value.sortType,
      () => filters_CMS.value.sort,
    ],
    async () => {
      await nextTick()
      await reload_CMS()
    },
    { flush: 'post' }
)
</script>

<template>
  <v-expansion-panels v-model="panelExpanded_MCS"  v-if="selectedSite == 'MCS'">
    <v-expansion-panel>
      <v-expansion-panel-title>
        <div class="d-flex align-center gap-2" style="flex: 1">
          <template v-if="!panelExpanded_MCS">
            <div class="active-filters">
              <v-chip
                  v-if="filters_MCS.keyword"
                  size="small"
                  class="mr-2"
              >
                <v-icon start icon="mdi-magnify"></v-icon>
                {{ filters_MCS.keyword }}
              </v-chip>

              <v-chip
                  size="small"
                  class="mr-2"
              >
                {{ typeLabels_MCS[filters_MCS.type] }}
              </v-chip>

              <v-chip
                  size="small"
                  class="mr-2"
              >
                <v-icon start icon="mdi-sort"></v-icon>
                {{ getSortLabel_MCS(filters_MCS.sortBy) }}
              </v-chip>
            </div>
          </template>

          <span v-if="!panelExpanded_MCS" class="text-grey">
          {{$t('webData.clickToExpandFilter')}}
        </span>
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <v-container class="filter-container">
          <v-row>
            <v-col cols="12" md="4">
        <v-text-field
          v-model="filters_MCS.keyword"
          :label="$t('webData.keywordFilter')"
          :placeholder="$t('webData.inputBlueprintNameOrDesc')"
          clearable
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
        ></v-text-field>
            </v-col>

            <v-col cols="12" md="4">
        <v-select
          v-model="filters_MCS.type"
          :items="blueprintTypes_MCS"
          :label="$t('webData.blueprintType')"
          clearable
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-shape"
          item-title="text"
          item-value="value"
        >
        </v-select>
            </v-col>

            <v-col cols="12" md="4">
        <v-select
          v-model="filters_MCS.sortBy"
          :items="sortOptions_MCS"
          :label="$t('webData.sortType')"
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-sort"
          item-title="text"
          item-value="value"
        ></v-select>
            </v-col>
          </v-row>
        </v-container>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
  <v-expansion-panels v-model="panelExpanded_CMS"  v-if="selectedSite == 'CMS'">
    <v-expansion-panel>
      <v-expansion-panel-title>
        <div class="d-flex align-center gap-2" style="flex: 1">
          <template v-if="!panelExpanded_CMS">
            <div class="active-filters">
              <v-chip
                  v-if="filters_CMS.filter"
                  size="small"
                  class="mr-2"
              >
                <v-icon start icon="mdi-magnify"></v-icon>
                {{ filters_CMS.filter }}
              </v-chip>

              <v-chip
                  size="small"
                  class="mr-2"
              >
                {{ typeLabels_CMS[filters_CMS.sortType] }}
              </v-chip>

              <v-chip
                  size="small"
                  class="mr-2"
              >
                <v-icon start icon="mdi-sort"></v-icon>
                {{ getSortLabel_CMS[filters_CMS.sort] }}
              </v-chip>
            </div>
          </template>

          <span v-if="!panelExpanded_CMS" class="text-grey">
          {{$t('webData.clickToExpandFilter')}}
        </span>
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <v-container class="filter-container">
          <v-row>
            <v-col cols="12" md="4">
        <v-text-field
          v-model="filters_CMS.filter"
          :label="$t('webData.keywordFilter')"
          :placeholder="$t('webData.inputBlueprintNameOrDesc')"
          clearable
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
          @change="reload_CMS"
        ></v-text-field>
            </v-col>

            <v-col cols="12" md="4">
        <v-select
          v-model="filters_CMS.sortType"
          :items="blueprintTypes_CMS"
          :label="$t('webData.blueprintType')"
          clearable
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-shape"
          item-title="text"
          item-value="value"
          @change="reload_CMS"
        >
        </v-select>
            </v-col>

            <v-col cols="12" md="4">
        <v-select
          v-model="filters_CMS.sort"
          :items="sortOptions_CMS"
          :label="$t('webData.sortType')"
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-sort"
          item-title="text"
          item-value="value"
          @change="reload_CMS"
        ></v-select>
            </v-col>
          </v-row>
        </v-container>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
  <v-list
      class="mc-blueprint-list"
      v-if="selectedSite == 'MCS'"
      ref="filterPanel"
      @scroll="handleScroll"
  >
    <v-infinite-scroll
        :items="schematics_MCS"
        @load="schematic_load_MCS"
        :has-more="hasMore_MCS"
    >
      <v-list-item
          v-for="(bp) in schematics_MCS"
          :key="bp.uuid"
          class="py-2"
          :title="bp.name"
      >
        <template v-slot:prepend>
          <v-avatar size="90" rounded="0" class="mr-2">
            <img :src="getMcSchematicPreview(bp.uuid)" style="height: 90px; width: 90px" :alt="bp.uuid">
          </v-avatar>
        </template>

        <template #title >
          <div class="d-flex align-center flex-wrap">
            <span v-if="bp.type == -1" class="text-h6 text-red-lighten-1">{{$t('webData.unparsed')}}</span>
            <span class="text-h6 text-blue-darken-4">{{ bp.name }}</span>
            <div class="ms-3 d-flex align-center ga-1">
              <v-chip
                  variant="outlined"
                  color="green-darken-2"
                  size="small"
                  class="me-2"
              >
                <v-avatar size="24" rounded="1" class="mr-2">
                  <img :src="bp.avatarUrl.replace('http', 'https')" style="height: 24px; width: 24px" :alt="bp.uuid">
                </v-avatar>
                {{ bp.nickName }}
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
                        <span v-for="(dim, index) in parseDimensions(bp.size)" :key="index">
                          {{ dim }}
                          <v-icon v-if="index < 2" icon="mdi-close" size="x-small" class="mx-1"></v-icon>
                        </span>
                  </div>
                </div>
              </v-chip>
              <v-chip
                  variant="outlined"
                  color="blue"
                  size="small"
                  class="me-2"
              >
                <v-icon><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><path fill="#0284c7" d="M16.5 8c0 1.5-.5 3.5-2.9 4.3c.7-1.7.8-3.4.3-5c-.7-2.1-3-3.7-4.6-4.6c-.4-.3-1.1.1-1 .7c0 1.1-.3 2.7-2 4.4C4.1 10 3 12.3 3 14.5C3 17.4 5 21 9 21c-4-4-1-7.5-1-7.5c.8 5.9 5 7.5 7 7.5c1.7 0 5-1.2 5-6.4c0-3.1-1.3-5.5-2.4-6.9c-.3-.5-1-.2-1.1.3"/></svg></v-icon>
                {{ bp.heat }}
              </v-chip>
            </div>
          </div>
        </template>

        <template #subtitle>
          <div class="d-flex flex-column mt-1">
            <p class="text-caption mb-1">
              {{ bp.description }}
            </p>

            <div class="d-flex align-center flex-wrap gap-3">
              <div class="d-flex align-center">
                <img :src="IMAGE_MAPPING[bp.type]" style="height: 20px; width: 32px" :alt="bp.uuid">
                <span class="text-caption">{{ schematicTypeListWeb[bp.type as 1 | 2 | 3 | 4 | 5] }}</span>
              </div>

              <div class="d-flex align-center">
                <v-icon icon="mdi-clock-outline" size="small" class="me-1"></v-icon>
                <span class="text-caption">{{ formatTime(bp.updateTime) }}</span>
              </div>
            </div>
          </div>
        </template>

        <template v-slot:append>
          <div class="d-flex flex-column align-center ga-2">
            <v-btn
                variant="tonal"
                color="info"
                prepend-icon="mdi-download"
                size="small"
                :loading="downLoading_MCS"
                @click="downloadAndUpload(bp.uuid, bp.type)"
            >
              {{$t('webData.import')}}
            </v-btn>
            <div class="d-flex ga-1">
              <v-btn
                  variant="tonal"
                  color="green"
                  prepend-icon="mdi-web"
                  size="small"
                  @click="openLink(`https://www.mcschematic.top/home/${bp.uuid}`)"
              >
                {{$t('webData.goTo')}}
              </v-btn>
            </div>
          </div>
        </template>
      </v-list-item>
      <template v-slot:load-more>
        <div class="text-center py-4">
          <v-progress-circular
              indeterminate
              color="info"
              size="24"
          ></v-progress-circular>
          <span class="ml-2 text-caption">{{$t('webData.loadingMore')}}</span>
        </div>
      </template>
      <template v-slot:empty>
        <div class="text-center py-4 text-grey">
          <v-icon icon="mdi-check-circle" class="mr-2"></v-icon>
          {{$t('webData.noMoreData')}}
        </div>
      </template>
    </v-infinite-scroll>

  </v-list>
  <v-list
      class="mc-blueprint-list"
      v-if="selectedSite == 'CMS'"
      ref="filterPanel"
      @scroll="handleScroll"
  >
    <v-infinite-scroll
        :items="schematics_CMS"
        @load="schematic_load_CMS"
        :has-more="hasMore_CMS"
    >
      <v-list-item
          v-for="(bp) in schematics_CMS"
          :key="bp.id"
          class="py-2"
          :title="bp.name"
      >
        <template v-slot:prepend>
          <v-avatar size="90" rounded="0" class="mr-2">
            <img :src="bp.img" style="height: 90px; width: 90px" :alt="bp.name">
          </v-avatar>
        </template>

        <template #title >
          <div class="d-flex align-center flex-wrap">
            <span class="text-h6 text-blue-darken-4">{{ bp.name }}</span>
            <div class="ms-3 d-flex align-center ga-1">
              <v-chip
                  variant="outlined"
                  color="green-darken-2"
                  size="small"
                  class="me-2"
              >
                <v-icon start icon="mdi-account"></v-icon>
                {{ bp.author }}
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
                        <span v-for="(dim, index) in parseDimensions_CMS(bp.size)" :key="index">
                          {{ dim }}
                          <v-icon v-if="index < 2" icon="mdi-close" size="x-small" class="mx-1"></v-icon>
                        </span>
                  </div>
                </div>
              </v-chip>
              <v-chip
                  variant="outlined"
                  color="blue"
                  size="small"
                  class="me-2"
              >
                <v-icon start> <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><path fill="#0284c7" d="m12 16l-5-5l1.4-1.45l2.6 2.6V4h2v8.15l2.6-2.6L17 11zm-6 4q-.825 0-1.412-.587T4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413T18 20z"/></svg></v-icon>
                {{ bp.download }}
              </v-chip>
              <v-chip
                  variant="outlined"
                  color="blue"
                  size="small"
                  class="me-2"
              >
                <v-avatar size="24" rounded="0" class="mr-2">
                  <img :src="cogImg" style="height: 24px; width: 24px" alt="cog">
                </v-avatar>
                {{ bp.stress }}
              </v-chip>
            </div>
          </div>
        </template>

        <template #subtitle>
          <div class="d-flex flex-column mt-1">
            <p class="text-caption mb-1">
              {{ bp.desc }}
            </p>

            <div class="d-flex align-center flex-wrap gap-3">
              <div class="d-flex align-center">
                <v-icon icon="mdi-format-list-bulleted-type" size="small" class="me-1"></v-icon>
                <span class="text-caption">{{ bp.type }}</span>
              </div>

              <div class="d-flex align-center">
                <v-icon icon="mdi-clock-outline" size="small" class="me-1"></v-icon>
                <span class="text-caption">{{ bp.time }}</span>
              </div>
            </div>
          </div>
        </template>

        <template v-slot:append>
          <div class="d-flex flex-column align-center ga-2">
            <v-btn
                variant="tonal"
                color="info"
                prepend-icon="mdi-download"
                size="small"
                :disabled="true"
            >
              {{$t('webData.import')}}
            </v-btn>
            <div class="d-flex ga-1">
              <v-btn
                  variant="tonal"
                  color="green"
                  prepend-icon="mdi-web"
                  size="small"
                  @click="openLink(`https://www.creativemechanicserver.com/detail/${bp.id}/`)"
              >
                {{$t('webData.goTo')}}
              </v-btn>
            </div>
          </div>
        </template>
      </v-list-item>
      <template v-slot:load-more>
        <div class="text-center py-4">
          <v-progress-circular
              indeterminate
              color="info"
              size="24"
          ></v-progress-circular>
          <span class="ml-2 text-caption">{{$t('webData.loadingMore')}}</span>
        </div>
      </template>
      <template v-slot:empty>
        <div class="text-center py-4 text-grey">
          <v-icon icon="mdi-check-circle" class="mr-2"></v-icon>
          {{$t('webData.noMoreData')}}
        </div>
      </template>
    </v-infinite-scroll>

  </v-list>
</template>

<style scoped>
.mc-blueprint-list {
  --v-list-item-padding: 12px;

  max-height: calc(93vh - 64px);
  overflow-y: auto;
}
</style>