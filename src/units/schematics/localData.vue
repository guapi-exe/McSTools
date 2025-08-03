<script setup lang="ts">

import {copySchematic} from "../../modules/copy_file.ts";
import {fetchSchematics, SchematicsData, schematicTypeList} from "../../modules/schematics_data.ts";
import {nextTick, ref, watch} from "vue";
import dayjs from "dayjs";
import {clear_tools, fetch_data} from "../../modules/tools_data.ts";
import {activeTab} from "../../modules/layout.ts";
import {userData} from "../../modules/user_data.ts";
import {delete_schematic} from "../../modules/delete_schematic.ts";
import {useRouter} from "vue-router";
import createImg from "../../static/img/create.jpg";
import lmImg from "../../static/img/Litematica.jpg";
import bgImg from "../../static/img/bg.jpg";
import weImg from "../../static/img/wordEdit.png";
import beImg from "../../static/img/grass_block.png";
import {selectLoading, toast} from "../../modules/others.ts";
const router = useRouter()
const loadState = ref()
const autoPage = ref(1)
const showDeleteDialog = ref(false)
const selectedBpId = ref(null)
const selectedBpName = ref('')
const hasMore = ref(true);
const panelExpanded = ref(false)
const isLoading = ref(false);
let schematics = ref<SchematicsData[]>([])
const filters = ref({
  keyword: '',
})

const parseDimensions = (sizeStr: string) => {
  const [length, width, height] = sizeStr.split(',').map(Number);
  return [`${length}`, `${width}`, `${height}`]
};
const IMAGE_MAPPING: Record<number, string> = {
  1: createImg,
  2: lmImg,
  3: weImg,
  4: bgImg,
  5: beImg
};
const selectSchematic = async(id: number) => {
  try{
    selectLoading.value = true
    clear_tools()
    await fetch_data(id)
    await router.push("/tools")
    activeTab.value = 'tools'
  }catch (e){
    console.log(e)
  }finally {
    selectLoading.value = false
  }

}
interface LoadParams {
  done: (status: 'ok' | 'error' | 'empty') => void
}
const reload = async () => {
  autoPage.value = 0;
  hasMore.value = true;
  isLoading.value = false;
  schematics.value = []
  if (!hasMore.value) {
    return
  }
  if (!hasMore.value || isLoading.value) return;

  try {
    isLoading.value = true;

    const { data, page, page_size } = await fetchSchematics({
      filter: filters.value.keyword,
      page: autoPage.value,
      page_size: 20
    });
    console.log(page, page_size)
    schematics.value = [...schematics.value, ...data];
    autoPage.value += 1;

    hasMore.value = data.length == 20;
    if (!hasMore.value) loadState.value('empty');
    else loadState.value('ok');
  } catch (error) {
    toast.error(`加载失败:${error}`, {
      timeout: 3000
    });
    //console.error('加载失败:', error);
  } finally {
    isLoading.value = false;
  }
}
const schematic_load = async ({ done }: LoadParams) => {
  loadState.value = done
  if (!hasMore.value) {
    done('empty')
    return
  }
  if (!hasMore.value || isLoading.value) return;

  try {
    isLoading.value = true;

    const { data, page, page_size } = await fetchSchematics({
      filter: filters.value.keyword,
      page: autoPage.value,
      page_size: 20
    });
    console.log(data, page, page_size)
    schematics.value = [...schematics.value, ...data];
    autoPage.value += 1;
    hasMore.value = data.length == 20;
    done('ok')
  } catch (error) {
    console.error('加载失败:', error);
    done('error')
  } finally {
    isLoading.value = false;
  }
}

const openDeleteDialog = (bp: SchematicsData) => {
  selectedBpId.value = bp.id
  selectedBpName.value = bp?.name || '未命名蓝图'
  showDeleteDialog.value = true
}

const schematicTags = (str: string) => {
  let schematic_tags = [] as string[];
  if ((str && typeof str === 'string') && str != "{}") {
    schematic_tags = str
        ? str.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
        : [];
  } else {
    schematic_tags = [];
  }
  return schematic_tags
}
const confirmDelete = async () => {
  try {
    await delete_schematic(selectedBpId.value)
    const index = schematics.value.findIndex(
        item => item.id === selectedBpId.value
    )
    userData.value.schematics -= 1;
    if (index !== -1) {
      schematics.value.splice(index, 1)

      userData.value.schematics = Math.max(
          userData.value.schematics - 1,
          0
      )
    }
    showDeleteDialog.value = false
  } catch (error) {
    console.error('删除失败:', error)
  }
}
watch(
    [
      () => filters.value.keyword,
    ],
    async () => {
      await nextTick()
      await reload()
    },
    { flush: 'post' }
)
const formatTime = (time: any) => {
  return dayjs(time).format('YYYY/MM/DD HH:mm')
}
</script>

<template>
  <v-expansion-panels >
    <v-expansion-panel>
      <v-expansion-panel-title>
        <div class="d-flex align-center gap-2" style="flex: 1">
          <template v-if="!panelExpanded">
            <div class="active-filters">
              <v-chip
                  v-if="filters.keyword"
                  size="small"
                  class="mr-2"
              >
                <v-icon start icon="mdi-magnify"></v-icon>
                {{ filters.keyword }}
              </v-chip>
            </div>
          </template>

          <span v-if="!panelExpanded" class="text-grey">
          点击展开筛选条件
        </span>
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <v-container class="filter-container">
          <v-row>
            <v-col cols="12" md="4">
              <v-text-field
                  v-model="filters.keyword"
                  label="关键词筛选"
                  placeholder="输入蓝图名称或描述"
                  clearable
                  density="compact"
                  variant="outlined"
                  prepend-inner-icon="mdi-magnify"
              ></v-text-field>
            </v-col>

          </v-row>
        </v-container>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
  <v-list class="mc-blueprint-list">
    <v-infinite-scroll
        :items="schematics"
        @load="schematic_load"
        :has-more="hasMore"
    >
      <v-list-item
          v-for="(bp) in schematics"
          :key="bp.id"
          class="py-2"
          :title="bp.name"

      >
        <template v-slot:prepend>
          <v-icon
              icon="mdi-cube-scan"
              size="60"
              class="app-logo"
          />
        </template>

        <template #title >
          <div class="d-flex align-center flex-wrap" @click="selectSchematic(bp.id)">
            <span v-if="bp.schematic_type == -1" class="text-h6 text-red-lighten-1">未解析</span>
            <span class="text-h6 text-blue-darken-4">{{ bp.name }}</span>
            <div class="ms-3 d-flex align-center ga-1">
              <v-chip
                  variant="outlined"
                  color="green-darken-2"
                  size="small"
                  class="me-2"
              >
                <v-icon start icon="mdi-account"></v-icon>
                {{ bp.user }}
              </v-chip>
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
              <v-chip
                  color="blue"
                  size="small"
              >
                <v-icon size="24" start icon="mdi-identifier"></v-icon>
                {{ bp.id }}
              </v-chip>
            </div>
          </div>
        </template>

        <template #subtitle>
          <div class="d-flex flex-column mt-1" @click="selectSchematic(bp.id)">
            <p class="text-caption mb-1">
              {{ bp.description }}
            </p>

            <div class="d-flex align-center flex-wrap gap-3">
              <div class="d-flex align-center">
                <img :src="IMAGE_MAPPING[bp.schematic_type]" style="height: 20px; width: 32px" :alt="bp.name">
                <span class="text-caption">{{ schematicTypeList[bp.schematic_type as 1 | 2 | 3 | 4] }}</span>
              </div>

              <div class="d-flex align-center flex-wrap gap-3">
                <div class="d-flex align-center">
                  <v-icon icon="mdi-tag" size="small" class="me-1"></v-icon>
                  <span class="text-caption">
                        v{{ bp.version }}
                        <v-chip size="x-small" color="green" class="ms-1">当前版本</v-chip>
                      </span>
                </div>
              </div>

              <div class="d-flex align-center">
                <v-icon icon="mdi-clock-outline" size="small" class="me-1"></v-icon>
                <span class="text-caption">{{ formatTime(bp.updated_at) }}</span>
              </div>

              <!-- 标签展示 -->
              <div class="d-flex align-center flex-wrap mt-1" v-if="schematicTags(bp.schematic_tags).length > 0">
                <v-chip
                    v-for="(tag, idx) in schematicTags(bp.schematic_tags).slice(0, 8)"
                    :key="idx"
                    color="primary"
                    size="x-small"
                    class="ma-1"
                    variant="outlined"
                >
                  <v-icon start size="14">mdi-tag</v-icon>
                  {{ tag }}
                </v-chip>

                <!-- 超出提示 -->
                <v-chip
                    v-if="schematicTags(bp.schematic_tags).length > 8"
                    color="grey"
                    size="x-small"
                    class="ma-1"
                    variant="outlined"
                >
                  +{{ schematicTags(bp.schematic_tags).length - 8 }}
                </v-chip>
              </div>
            </div>
          </div>
        </template>

        <template v-slot:append>
          <div class="d-flex flex-column align-center ga-2">
            <v-btn
                variant="tonal"
                color="primary"
                prepend-icon="mdi-download"
                size="small"
                @click="copySchematic(bp.id, bp.sub_type, bp.version, bp.schematic_type)"
            >
              导出
            </v-btn>
            <div class="d-flex ga-1">
              <v-btn
                  variant="text"
                  color="grey-darken-1"
                  icon="mdi-pencil"
                  density="comfortable"
                  @click="selectSchematic(bp.id)"
                  :loading="selectLoading"
              ></v-btn>
              <v-btn
                  variant="text"
                  color="red-lighten-1"
                  icon="mdi-delete"
                  density="comfortable"
                  @click="openDeleteDialog(bp)"
              ></v-btn>


            </div>
          </div>
        </template>
      </v-list-item>
      <template v-slot:load-more>
        <div class="text-center py-4">
          <v-progress-circular
              indeterminate
              color="primary"
              size="24"
          ></v-progress-circular>
          <span class="ml-2 text-caption">正在加载更多数据...</span>
        </div>
      </template>
      <template v-slot:empty>
        <div class="text-center py-4 text-grey">
          <v-icon icon="mdi-check-circle" class="mr-2"></v-icon>
          已经到底了，没有更多数据啦~
        </div>
      </template>
    </v-infinite-scroll>

  </v-list>
  <v-dialog v-model="showDeleteDialog" max-width="600" persistent>
    <v-card>
      <v-card-title class="headline">
        <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
        确认删除
      </v-card-title>

      <v-card-text>
        确定要永久删除蓝图 <strong>{{ selectedBpName }}</strong> (ID: {{ selectedBpId }}) 吗？此操作不可恢复！
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            color="grey-darken-1"
            @click="showDeleteDialog = false"
        >
          取消
        </v-btn>
        <v-btn
            color="error"
            @click="confirmDelete"
        >
          确认删除
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.mc-blueprint-list {
  --v-list-item-padding: 12px;

  max-height: calc(93vh - 64px);
  overflow-y: auto;
}
</style>