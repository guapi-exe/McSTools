<script setup lang="ts">

import {batchExportSchematics, copySchematic} from "../../modules/copy_file.ts";
import {
  fetchDistinctGameVersions,
  fetchSchematicCount,
  fetchSchematics,
  SchematicsData,
  schematicTypeList
} from "../../modules/schematics_data.ts";
import {computed, onActivated, onBeforeUnmount, onMounted, ref, watch} from "vue";
import dayjs from "dayjs";
import {clear_tools, fetch_data} from "../../modules/tools_data.ts";
import {activeTab} from "../../modules/layout.ts";
import {fetchUserClassification, userData} from "../../modules/user_data.ts";
import {delete_schematic} from "../../modules/delete_schematic.ts";
import {useRouter} from "vue-router";
import createImg from "../../static/img/create.jpg";
import lmImg from "../../static/img/Litematica.jpg";
import bgImg from "../../static/img/bg.jpg";
import weImg from "../../static/img/wordEdit.png";
import beImg from "../../static/img/grass_block.png";
import {selectClassification, selectLoading, toast} from "../../modules/others.ts";
import {update_schematic_name, update_user_classification} from "../../modules/update_schematic.ts";
import {useI18n} from "vue-i18n";
import {localSchematicsRefreshVersion} from "../../modules/upload_schematic.ts";
import ScrollRail from "../../layout/ScrollRail.vue";

const BULK_PAGE_SIZE = 100

const router = useRouter()
const loadState = ref()
const autoPage = ref(1)
const total = ref(0)
const pageSize = ref(20)
const sortBy = ref<'created_at' | 'updated_at' | 'name'>('created_at')
const sortOrder = ref<'asc' | 'desc'>('desc')
const filterType = ref(-1)
const filterGameVersion = ref('')
const jumpPageInput = ref('')
const gameVersionOptions = ref<string[]>([])
const showDeleteDialog = ref(false)
const showDeleteDialog2 = ref(false)
const showBatchDeleteDialog = ref(false)
const selectedBpId = ref(null)
const draggingOverId = ref<number | null>(null)
const selectedBpName = ref('')
const hasMore = ref(true);
const isDraggingTag = ref(false)
const rail_e = ref(true) // rail 折叠状态
const panelExpanded = ref(false)
const isLoading = ref(false);
const open = ref(false);
const checks = ref(false);
const tags = ref<string[]>([])
const selectedIds = ref<number[]>([])

type DisplaySchematicsData = SchematicsData & {
  displayDimensions: string[]
  displayTags: string[]
  displayVisibleTags: string[]
  displayExtraTagCount: number
  displayUpdatedAt: string
  displayTypeLabel: string
  displayImage: string
}

const schematics = ref<DisplaySchematicsData[]>([])
const showCreateTagDialog = ref(false);
const newTagName = ref('');
const countMap = ref<Record<string, number>>({});
const lastHandledRefreshVersion = ref(0)
const selectingAll = ref(false)
const exportingSelected = ref(false)
const deletingSelected = ref(false)
const filters = ref({
  keyword: '',
})
const { t: $t, locale } = useI18n()

let reloadToken = 0
let lastRequestedQueryKey = ''
let keywordReloadTimer: number | null = null

const keepActionMenuOpen = () => {
  requestAnimationFrame(() => {
    open.value = true
  })
}

const getCurrentClassification = () => {
  const value = selectClassification.value

  if (Array.isArray(value)) {
    return value[0] || ''
  }

  return typeof value === 'string' ? value : ''
}

const currentClassification = computed(() => getCurrentClassification())
const selectedIdSet = computed(() => new Set(selectedIds.value))

const getQueryKey = (
    classification = currentClassification.value,
    keyword = filters.value.keyword,
) => [
  classification,
  keyword,
  filterType.value,
  filterGameVersion.value,
  sortBy.value,
  sortOrder.value,
  pageSize.value,
].join('\u0000')

// Shared query shape for every fetch path (reload / infinite load / jump to
// page / bulk select) so list and counts always agree on the filter set.
const requestParams = () => ({
  filter: filters.value.keyword,
  classification: currentClassification.value,
  page_size: pageSize.value,
  sort_by: sortBy.value,
  sort_order: sortOrder.value,
  schematic_type: filterType.value,
  game_version: filterGameVersion.value,
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const parseDimensions = (sizeStr: string) => {
  const [length, width, height] = sizeStr.split(',').map(Number);
  return [`${length}`, `${width}`, `${height}`]
};
const IMAGE_MAPPING: Record<number, string> = {
  1: createImg,
  2: lmImg,
  3: weImg,
  4: bgImg,
  5: beImg,
  6: weImg
};
const selectSchematic = async(id: number) => {
  try{
    selectLoading.value = true
    clear_tools()
    // Navigate first — the editor opens instantly and the (deduped) data
    // fetch streams in behind it, instead of freezing the library page while
    // five payloads parse on the main thread.
    void router.push("/tools")
    activeTab.value = 'tools'
    await fetch_data(id)
  }catch (e){
    console.log(e)
  }finally {
    selectLoading.value = false
  }

}
const reload = async () => {
  if (keywordReloadTimer !== null) {
    window.clearTimeout(keywordReloadTimer)
    keywordReloadTimer = null
  }

  const requestToken = ++reloadToken
  const queryKey = getQueryKey()
  lastRequestedQueryKey = queryKey

  autoPage.value = 1
  hasMore.value = true
  selectedIds.value = []
  // Keep the previous page visible while the new query is loading.  Replacing
  // it only after the response arrives avoids a blank frame and a second full
  // layout pass when categories are switched quickly.
  isLoading.value = true

  try {
    const { data, total: totalCount } = await fetchSchematics({
      ...requestParams(),
      page: 1
    });

    // A slower request from a previous category/filter must never overwrite
    // the result that the user currently sees.
    if (requestToken !== reloadToken || queryKey !== getQueryKey()) return

    schematics.value = decorateSchematics(data)
    total.value = totalCount
    autoPage.value = 2
    hasMore.value = schematics.value.length < totalCount;
    if (!hasMore.value) loadState.value?.('empty');
    else loadState.value?.('ok');
  } catch (error) {
    if (requestToken === reloadToken) {
      lastRequestedQueryKey = ''
      toast.error(`加载失败:${error}`, {
        timeout: 3000
      });
    }
  } finally {
    if (requestToken === reloadToken) {
      isLoading.value = false;
    }
  }
}

const selectCategory = (classification: string) => {
  const nextClassification = classification || ''
  const nextQueryKey = getQueryKey(nextClassification)

  // Vuetify updates v-model:selected as part of the click event.  Comparing
  // against the last requested key (instead of only the current ref) keeps a
  // repeated click from starting another expensive request while still
  // loading a newly selected category.
  if (nextQueryKey === lastRequestedQueryKey) return

  if (keywordReloadTimer !== null) {
    window.clearTimeout(keywordReloadTimer)
    keywordReloadTimer = null
  }
  // VList's `selected` model is an array even for a single-leaf list. Keep
  // the model in the shape Vuetify expects; the computed helper above unwraps
  // it for request parameters and comparisons.
  selectClassification.value = nextClassification ? [nextClassification] : []
  void reload()
}

const loadCounts = async () => {
  if (tags.value.length === 0) {
    countMap.value = {};
    return;
  }

  const counts = await Promise.all(
      tags.value.map(async (tag) => [tag, await fetchSchematicCount(tag)] as const)
  )

  countMap.value = Object.fromEntries(counts)
};

const openCreateTagDialog = async () => {
  showCreateTagDialog.value = true;
}

const createTag = async () => {
  const name = newTagName.value.trim()
  if (!name) return

  if (tags.value.includes(name)) {
    toast.error(`分类「${name}」已存在！`, { timeout: 2000 })
    return
  }

  tags.value.push(name)
  const allTagsString = tags.value.join(',')
  await update_user_classification(allTagsString)

  newTagName.value = ''
  showCreateTagDialog.value = false
  await loadCounts()
}

interface LoadParams {
  done: (status: 'ok' | 'error' | 'empty') => void
}

const schematic_load = async ({ done }: LoadParams) => {
  loadState.value = done
  if (!hasMore.value) {
    done('empty')
    return
  }
  if (isLoading.value) {
    done('ok')
    return
  }

  const requestToken = reloadToken
  const queryKey = getQueryKey()
  const page = autoPage.value

  try {
    isLoading.value = true;
    const { data, total: totalCount } = await fetchSchematics({
      ...requestParams(),
      page
    });

    if (requestToken !== reloadToken || queryKey !== getQueryKey()) {
      done('ok')
      return
    }

    schematics.value = [...schematics.value, ...decorateSchematics(data)];
    total.value = totalCount
    autoPage.value = page + 1;
    hasMore.value = schematics.value.length < totalCount;
    done('ok')
  } catch (error) {
    console.error('加载失败:', error);
    done('error')
  } finally {
    if (requestToken === reloadToken) {
      isLoading.value = false;
    }
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

const formatTime = (time: any) => {
  return dayjs(time).format('YYYY/MM/DD HH:mm')
}

const decorateSchematic = (bp: SchematicsData): DisplaySchematicsData => {
  const display = bp as DisplaySchematicsData
  display.displayDimensions = parseDimensions(bp.sizes)
  display.displayTags = schematicTags(bp.schematic_tags)
  display.displayVisibleTags = display.displayTags.slice(0, 8)
  display.displayExtraTagCount = Math.max(0, display.displayTags.length - 8)
  display.displayUpdatedAt = formatTime(bp.updated_at)
  display.displayTypeLabel = schematicTypeList[
      bp.schematic_type as keyof typeof schematicTypeList
  ] ?? ''
  display.displayImage = IMAGE_MAPPING[bp.schematic_type] ?? createImg
  return display
}

const decorateSchematics = (data: SchematicsData[]) => data.map(decorateSchematic)
const displaySchematics = computed(() => schematics.value)

const handleDragStart = (event: DragEvent, tag: string) => {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('tag', tag)
  event.dataTransfer.effectAllowed = 'copy'

  const ghost = document.createElement('div')
  ghost.innerText = `🏷 ${tag}`
  ghost.style.padding = '4px 8px'
  ghost.style.background = '#1976d2'
  ghost.style.color = '#fff'
  ghost.style.borderRadius = '6px'
  ghost.style.fontSize = '12px'
  document.body.appendChild(ghost)

  event.dataTransfer.setDragImage(ghost, 0, 0)
  setTimeout(() => document.body.removeChild(ghost), 0)
  isDraggingTag.value = true
}


const handleDragEnter = (bp: SchematicsData) => {
  draggingOverId.value = bp.id
}

const handleDragLeave = (bp: SchematicsData) => {
  if (draggingOverId.value === bp.id) {
  }
}

const handleDrop = async (event: DragEvent, bp: DisplaySchematicsData) => {
  draggingOverId.value = null
  if (!event.dataTransfer) return
  const tag = event.dataTransfer.getData('tag')
  if (!tag) return

  let currentTags = schematicTags(bp.schematic_tags)

  if (currentTags.includes(tag)) {
    toast.error(`蓝图「${bp.name}」已有标签「${tag}」`, { timeout: 3000 })
    return
  }

  currentTags.push(tag)

  const tagsString = currentTags.join(',');
  await update_schematic_name(
      bp.id,
      bp.name,
      tagsString,
      bp.description
  );

  bp.schematic_tags = currentTags.join(',')
  bp.displayTags = currentTags
  bp.displayVisibleTags = currentTags.slice(0, 8)
  bp.displayExtraTagCount = Math.max(0, currentTags.length - 8)
  isDraggingTag.value = false
  countMap.value[tag] = (countMap.value[tag] ?? 0) + 1
  toast.success(`已为蓝图「${bp.name}」添加标签「${tag}」`, { timeout: 3000 })
}
const confirmDeleteClassification = async () => {
  try {
    const classification = getCurrentClassification()
    tags.value = tags.value.filter(t => t !== classification)

    const allTagsString = tags.value.join(',')
    await update_user_classification(allTagsString)

    showDeleteDialog2.value = false
    selectClassification.value = []
    await syncClassificationState()
    await reload()
  } catch (error) {
    console.error('删除失败:', error)
  }
}

const confirmDelete = async () => {
  try {
    await delete_schematic(selectedBpId.value)
    selectedIds.value = selectedIds.value.filter(id => id !== selectedBpId.value)
    if (userData.value) {
      userData.value.schematics = Math.max((userData.value.schematics ?? 0) - 1, 0)
    }
    showDeleteDialog.value = false
    await loadCounts()
    await reload()
  } catch (error) {
    console.error('删除失败:', error)
  }
}

watch(
    [
      () => filters.value.keyword,
    ],
    () => {
      if (keywordReloadTimer !== null) {
        window.clearTimeout(keywordReloadTimer)
      }

      keywordReloadTimer = window.setTimeout(() => {
        keywordReloadTimer = null
        void reload()
      }, 180)
    },
    { flush: 'post' }
)
const syncClassificationState = async () => {
  await fetchUserClassification();
  const classification = userData.value?.classification
  if (typeof classification === 'string') {
    tags.value = classification
        ? classification.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
        : [];
  } else {
    tags.value = [];
  }

  await loadCounts();
}

const fetchAllMatchingSchematics = async () => {
  const allSchematics: SchematicsData[] = []
  let page = 1

  while (true) {
    const { data } = await fetchSchematics({
      ...requestParams(),
      page,
      page_size: BULK_PAGE_SIZE,
    })

    allSchematics.push(...data)

    if (data.length < BULK_PAGE_SIZE) {
      break
    }

    page += 1
  }

  return allSchematics
}

// The page currently on screen: the last page pulled into the accumulated
// list (after a jump this is the jumped-to page; scrolling appends the next).
const currentPage = computed(() => Math.max(1, autoPage.value - 1))

// Jump straight to a page: replaces the list with that single page, then
// continues the usual infinite accumulation from page+1 while scrolling.
const gotoPage = async (targetPage?: number) => {
  const requested = targetPage ?? (parseInt(jumpPageInput.value, 10) || 1)
  const target = Math.min(Math.max(requested, 1), totalPages.value)
  jumpPageInput.value = String(target)
  if (isLoading.value) return

  const requestToken = ++reloadToken
  const queryKey = getQueryKey()
  lastRequestedQueryKey = queryKey
  isLoading.value = true

  try {
    const { data, total: totalCount } = await fetchSchematics({
      ...requestParams(),
      page: target
    })

    if (requestToken !== reloadToken || queryKey !== getQueryKey()) return

    schematics.value = decorateSchematics(data)
    total.value = totalCount
    autoPage.value = target + 1
    hasMore.value = target * pageSize.value < totalCount
    if (!hasMore.value) loadState.value?.('empty');
    else loadState.value?.('ok');

    const list = document.querySelector('.mc-blueprint-list') as HTMLElement | null
    if (list) list.scrollTop = 0
  } catch (error) {
    toast.error(`加载失败:${error}`, { timeout: 3000 })
  } finally {
    if (requestToken === reloadToken) {
      isLoading.value = false
    }
  }
}

const sortOptions = computed(() => [
  { title: $t('localData.toolbar.sortNewest'), value: 'created_at:desc' },
  { title: $t('localData.toolbar.sortOldest'), value: 'created_at:asc' },
  { title: $t('localData.toolbar.sortUpdated'), value: 'updated_at:desc' },
  { title: $t('localData.toolbar.sortName'), value: 'name:asc' },
])

const sortSelection = computed({
  get: () => `${sortBy.value}:${sortOrder.value}`,
  set: (value: string) => {
    const [by, order] = value.split(':')
    sortBy.value = (by as typeof sortBy.value) || 'created_at'
    sortOrder.value = (order === 'asc' ? 'asc' : 'desc') as typeof sortOrder.value
  },
})

const typeOptions = computed(() => [
  { title: $t('localData.filter.allTypes'), value: -1 },
  ...Object.entries(schematicTypeList).map(([value, title]) => ({ title, value: Number(value) })),
])

const typeTitle = (value: number) =>
    schematicTypeList[value as keyof typeof schematicTypeList] ?? String(value)

const versionOptions = computed(() => [
  { title: $t('localData.filter.allVersions'), value: '' },
  ...gameVersionOptions.value.map(v => ({ title: v, value: v })),
])

const loadGameVersions = async () => {
  if (gameVersionOptions.value.length > 0) return
  try {
    gameVersionOptions.value = await fetchDistinctGameVersions()
  } catch {
    // toast already surfaced by the fetch wrapper
  }
}

watch(panelExpanded, expanded => {
  if (expanded) void loadGameVersions()
})

watch([pageSize, sortBy, sortOrder, filterType, filterGameVersion], () => {
  void reload()
})

onMounted(async () => {
  await syncClassificationState();
  await reload()
  lastHandledRefreshVersion.value = localSchematicsRefreshVersion.value
});

onActivated(async () => {
  if (lastHandledRefreshVersion.value === localSchematicsRefreshVersion.value) {
    return
  }

  await syncClassificationState()
  await reload()
  lastHandledRefreshVersion.value = localSchematicsRefreshVersion.value
})

onBeforeUnmount(() => {
  if (keywordReloadTimer !== null) {
    window.clearTimeout(keywordReloadTimer)
    keywordReloadTimer = null
  }
  reloadToken += 1
})

const selectAll = async () => {
  try {
    checks.value = true
    selectingAll.value = true
    const allSchematics = await fetchAllMatchingSchematics()
    selectedIds.value = allSchematics.map(bp => bp.id)
  } catch (error) {
    toast.error(`全选失败:${error}`, { timeout: 3000 })
  } finally {
    selectingAll.value = false
    keepActionMenuOpen()
  }
}
const clearAll = () => {
  selectedIds.value = []
  keepActionMenuOpen()
}

const toggleMultiSelect = () => {
  checks.value = !checks.value
  if (!checks.value) {
    selectedIds.value = []
  }
  keepActionMenuOpen()
}

const batchExport = async () => {
  if (selectedIds.value.length === 0) {
    toast.error("请至少选择一个蓝图！", { timeout: 2000 })
    return
  }

  try {
    exportingSelected.value = true
    const selectedIdSet = new Set(selectedIds.value)
    let selectedBps: SchematicsData[] = schematics.value.filter(b => selectedIdSet.has(b.id))

    if (selectedBps.length !== selectedIds.value.length) {
      const allSchematics = await fetchAllMatchingSchematics()
      selectedBps = allSchematics.filter(b => selectedIdSet.has(b.id))
    }

    if (selectedBps.length === 0) {
      toast.error("未找到可导出的蓝图！", { timeout: 2000 })
      return
    }

    await batchExportSchematics(selectedBps)
  } finally {
    exportingSelected.value = false
    keepActionMenuOpen()
  }
}

const openBatchDeleteDialog = () => {
  if (selectedIds.value.length === 0) {
    toast.error("请至少选择一个蓝图！", { timeout: 2000 })
    keepActionMenuOpen()
    return
  }

  showBatchDeleteDialog.value = true
  keepActionMenuOpen()
}

const confirmBatchDelete = async () => {
  const idsToDelete = Array.from(new Set(selectedIds.value))
  if (idsToDelete.length === 0) {
    showBatchDeleteDialog.value = false
    return
  }

  try {
    deletingSelected.value = true
    for (const id of idsToDelete) {
      await delete_schematic(id)
    }

    selectedIds.value = []
    if (userData.value) {
      userData.value.schematics = Math.max((userData.value.schematics ?? 0) - idsToDelete.length, 0)
    }
    showBatchDeleteDialog.value = false
    await loadCounts()
    await reload()
    toast.success($t('localData.deleteSuccess', { count: idsToDelete.length }), { timeout: 3000 })
  } catch (error) {
    console.error('批量删除失败:', error)
    toast.error($t('localData.deleteFailed', { error: String(error) }), { timeout: 3000 })
  } finally {
    deletingSelected.value = false
    keepActionMenuOpen()
  }
}

</script>

<template>
  <div class="schematics-page">
  <v-expansion-panels
      rail
      v-model="panelExpanded"
  >
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
              <v-chip
                  v-if="filterType > 0"
                  size="small"
                  class="mr-2"
              >
                <v-icon start icon="mdi-cube-outline"></v-icon>
                {{ typeTitle(filterType) }}
              </v-chip>
              <v-chip
                  v-if="filterGameVersion"
                  size="small"
                  class="mr-2"
              >
                <v-icon start icon="mdi-tag-outline"></v-icon>
                {{ filterGameVersion }}
              </v-chip>
            </div>
          </template>

          <span v-if="!panelExpanded" class="text-grey">
          {{$t('localData.clickToExpandFilter')}}
        </span>
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <v-container class="filter-container">
          <v-row>
            <v-col cols="12" md="4">
        <v-text-field
          v-model="filters.keyword"
          :label="$t('localData.keywordFilter')"
          :placeholder="$t('localData.inputBlueprintNameOrDesc')"
          clearable
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
        ></v-text-field>
            </v-col>
            <v-col cols="6" md="3">
              <v-select
                  v-model="filterType"
                  :items="typeOptions"
                  item-title="title"
                  item-value="value"
                  :label="$t('localData.filter.type')"
                  density="compact"
                  variant="outlined"
                  hide-details
              ></v-select>
            </v-col>
            <v-col cols="6" md="3">
              <v-select
                  v-model="filterGameVersion"
                  :items="versionOptions"
                  item-title="title"
                  item-value="value"
                  :label="$t('localData.filter.gameVersion')"
                  density="compact"
                  variant="outlined"
                  hide-details
              ></v-select>
            </v-col>

          </v-row>
        </v-container>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
  <v-card style="flex: 1 1 0; min-height: 0; display: flex; flex-direction: column;">
    <v-layout style="flex: 1; display: flex; overflow: hidden;">
      <v-navigation-drawer
          v-model:rail="rail_e"
          permanent
          floating
          class="schematics-drawer"
          style="z-index: 10;height: 100%;"
          fixed
          :elevation="3"
          :rail-width="120"
          :width="200"
      >
        <template #prepend>
          <div class="drawer-toggle">
            <v-btn
                variant="text"
                size="small"
                :icon="rail_e ? 'mdi-chevron-right' : 'mdi-chevron-left'"
                :title="rail_e ? '展开分类' : '收起分类'"
                @click.stop="rail_e = !rail_e"
            />
          </div>
        </template>
        <v-list
            density="compact"
            nav
            class="nav-list"
            style="padding-inline:0; flex: 1; overflow-y: auto;"
            v-model:selected="selectClassification"
        >
          <v-list-item
              link
              value=""
              class="nav-item"
              :class="{ 'active-item': currentClassification === '' }"
              @click="selectCategory('')"
          >
              <v-list-item-title
                  class="font-medium mt-2"
              >
                <v-icon size="20">mdi-cube-outline</v-icon>
                {{$t('localData.allBlueprints')}}
              </v-list-item-title>
            <template #append>
              <v-badge v-if="!rail_e" color="info" :content="userData?.schematics ?? 0" inline></v-badge>
            </template>
          </v-list-item>
          <v-divider class="my-2"></v-divider>

          <v-list-item
              v-for="tag in tags"
              :key="tag"
              :value="tag"
              link
              class="nav-item"
              :class="{ 'active-item': currentClassification === tag }"
              @click="selectCategory(tag)"
              draggable="true"
              @dragstart="handleDragStart($event, tag)"
          >
            <v-list-item-title class="font-medium mt-2">
              <v-icon size="20" class="cursor-grab" v-if="!rail_e">mdi-drag-vertical</v-icon>
              <v-icon size="20">mdi-bookmark-box-multiple-outline</v-icon>
              {{ tag }}
            </v-list-item-title>
            <template #append>
              <v-badge v-if="!rail_e" color="info" :content="countMap[tag] ?? 0" inline></v-badge>
              <v-btn
                  v-if="currentClassification === tag"
                  icon="mdi-close"
                  variant="text"
                  color="red"
                  density="comfortable"
                  @click.stop="showDeleteDialog2 = true"
              />
            </template>
          </v-list-item>
        </v-list>


        <template v-slot:append>
          <v-divider class="my-2"></v-divider>
          <v-list density="compact" nav>
            <v-list-item @click="openCreateTagDialog" class="mt-auto">
              <v-list-item-title class="font-medium mt-2">
                <v-icon size="20">mdi-plus-box-outline</v-icon>
                {{$t('localData.createCategory')}}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </template>
      </v-navigation-drawer>

      <v-main>
        <v-list
            class="mc-blueprint-list"
            :class="{ 'mc-blueprint-list--large': schematics.length > 40 }"
        >
          <v-infinite-scroll
              :items="displaySchematics"
              @load="schematic_load"
              :has-more="hasMore"
              item-height="80"
          >
            <v-list-item
                v-for="bp in displaySchematics"
                :key="bp.id"
                v-memo="[bp, bp.id, bp.name, bp.description, bp.user, bp.game_version, bp.version, bp.sizes, bp.schematic_type, bp.schematic_tags, bp.displayTags, bp.displayVisibleTags, bp.displayExtraTagCount, selectedIdSet.has(bp.id), draggingOverId === bp.id, checks, isDraggingTag, selectLoading, locale]"
                class="py-2 blueprint-item"
                :class="{ 'drag-over': draggingOverId == bp.id, 'selected-item': selectedIdSet.has(bp.id), 'drag-ready': isDraggingTag }"
                :title="bp.name"
                @drop="handleDrop($event, bp)"
                @dragover.prevent
                @dragenter="handleDragEnter(bp)"
                @dragleave="handleDragLeave(bp)"
            >
              <template v-slot:prepend>
                <v-checkbox
                    v-if="checks"
                    v-model="selectedIds"
                    :value="bp.id"
                    density="compact"
                    hide-details
                ></v-checkbox>
                <v-icon
                    icon="mdi-cube-scan"
                    size="60"
                    class="app-logo"
                />
              </template>

              <template #title >
                <div class="d-flex align-center flex-wrap" @click="selectSchematic(bp.id)">
                  <span v-if="bp.schematic_type == -1" class="text-h6 text-red-lighten-1">{{$t('localData.unparsed')}}</span>
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
                        <span v-for="(dim, index) in bp.displayDimensions" :key="index">
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
                      <img :src="bp.displayImage" style="height: 20px; width: 32px" :alt="bp.name">
                      <span class="text-caption">{{ bp.displayTypeLabel }}</span>
                    </div>

                    <div class="d-flex align-center flex-wrap gap-3">
                      <div class="d-flex align-center">
                        <v-icon icon="mdi-tag" size="small" class="me-1"></v-icon>
                        <span class="text-caption">
                        v{{ bp.version }}
                        <v-chip size="x-small" color="green" class="ms-1">{{$t('localData.currentVersion')}}</v-chip>
                      </span>
                      </div>
                    </div>

                    <div class="d-flex align-center">
                      <v-icon icon="mdi-clock-outline" size="small" class="me-1"></v-icon>
                      <span class="text-caption">{{ bp.displayUpdatedAt }}</span>
                    </div>

                    <!-- 标签展示 -->
                    <div class="d-flex align-center flex-wrap mt-1" v-if="bp.displayTags.length > 0">
                      <v-chip
                          v-for="(tag, idx) in bp.displayVisibleTags"
                          :key="`${tag}-${idx}`"
                          color="info"
                          size="x-small"
                          class="ma-1"
                          variant="outlined"
                      >
                        <v-icon start size="14">mdi-tag</v-icon>
                        {{ tag }}
                      </v-chip>

                      <!-- 超出提示 -->
                      <v-chip
                          v-if="bp.displayExtraTagCount > 0"
                          color="info"
                          size="x-small"
                          class="ma-1"
                          variant="outlined"
                      >
                        +{{ bp.displayExtraTagCount }}
                      </v-chip>
                    </div>
                  </div>
                </div>
              </template>

              <template v-slot:append>
                <div class="d-flex flex-column align-center ga-2">
                  <v-btn
                      variant="tonal"
                      prepend-icon="mdi-download"
                      size="small"
                      color="info"
                      @click="copySchematic(bp.id, bp.sub_type, bp.version, bp.schematic_type, bp.name)"
                  >
                    {{$t('localData.export')}}
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
                    color="info"
                    size="24"
                ></v-progress-circular>
                <span class="ml-2 text-caption">{{$t('localData.loadingMore')}}</span>
              </div>
            </template>
            <template v-slot:empty>
              <div class="text-center py-4 text-grey">
                <v-icon icon="mdi-check-circle" class="mr-2"></v-icon>
                {{$t('localData.noMoreData')}}
              </div>
            </template>
          </v-infinite-scroll>
        </v-list>
      </v-main>

    </v-layout>

    <div class="list-toolbar">
      <span class="text-caption text-medium-emphasis">
        {{ $t('localData.toolbar.total', { count: total }) }}
      </span>
      <v-spacer />
      <v-select
          v-model="sortSelection"
          :items="sortOptions"
          density="compact"
          variant="outlined"
          hide-details
          class="toolbar-select"
      ></v-select>
      <v-divider vertical inset class="mx-1 toolbar-divider" />
      <span class="text-caption text-medium-emphasis">{{ $t('localData.toolbar.perPage') }}</span>
      <v-select
          v-model="pageSize"
          :items="[20, 50, 100]"
          density="compact"
          variant="outlined"
          hide-details
          class="toolbar-select toolbar-select--narrow"
      ></v-select>
      <v-divider vertical inset class="mx-1 toolbar-divider" />
      <v-btn
          icon="mdi-chevron-left"
          size="small"
          variant="text"
          :disabled="currentPage <= 1 || isLoading"
          @click="gotoPage(currentPage - 1)"
      />
      <span class="page-indicator text-caption text-medium-emphasis">
        {{ currentPage }} / {{ totalPages }}
      </span>
      <v-btn
          icon="mdi-chevron-right"
          size="small"
          variant="text"
          :disabled="currentPage >= totalPages || isLoading"
          @click="gotoPage(currentPage + 1)"
      />
      <v-divider vertical inset class="mx-1 toolbar-divider" />
      <v-text-field
          v-model="jumpPageInput"
          type="number"
          min="1"
          :max="totalPages"
          density="compact"
          variant="outlined"
          hide-details
          class="toolbar-jump"
          :placeholder="$t('localData.toolbar.jumpTo')"
          @keyup.enter="gotoPage()"
      ></v-text-field>
      <v-btn density="compact" variant="outlined" @click="gotoPage()">
        {{ $t('localData.toolbar.go') }}
      </v-btn>
    </div>

  </v-card>
  <v-dialog v-model="showCreateTagDialog" max-width="600" persistent>
    <v-card
        class="v-theme--custom"
    >
      <v-card-title>创建新分类</v-card-title>
      <v-card-text>
        <v-text-field
            v-model="newTagName"
            label="标签名称"
            clearable
        ></v-text-field>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            text
            @click="showCreateTagDialog = false"
        >取消</v-btn>
        <v-btn color="info"
               @click="createTag"
        >创建</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="showDeleteDialog" max-width="600" persistent>
    <v-card
        class="v-theme--custom"
    >
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
  <v-dialog v-model="showDeleteDialog2" max-width="600" persistent>
    <v-card
        class="v-theme--custom"
    >
      <v-card-title class="headline">
        <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
        确认删除
      </v-card-title>

      <v-card-text>
        确定要删除分类 <strong>{{ currentClassification }}</strong> 吗？此操作不可恢复！
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            color="grey-darken-1"
            @click="showDeleteDialog2 = false"
        >
          取消
        </v-btn>
        <v-btn
            color="error"
            @click="confirmDeleteClassification"
        >
          确认删除
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="showBatchDeleteDialog" max-width="600" persistent>
    <v-card
        class="v-theme--custom"
    >
      <v-card-title class="headline">
        <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
        {{ $t('localData.confirmDelete') }}
      </v-card-title>

      <v-card-text>
        {{ $t('localData.confirmBatchDeleteBlueprints', { count: selectedIds.length }) }}
        {{ $t('localData.thisActionCannotBeUndone') }}
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            color="grey-darken-1"
            :disabled="deletingSelected"
            @click="showBatchDeleteDialog = false"
        >
          {{ $t('localData.cancel') }}
        </v-btn>
        <v-btn
            color="error"
            :loading="deletingSelected"
            @click="confirmBatchDelete"
        >
          {{ $t('localData.batchDelete') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <div class="local-action-menu" @click.stop>
    <transition name="local-action-panel">
      <div v-if="open" class="local-action-panel">
        <v-btn
            prepend-icon="mdi-filter-multiple-outline"
            size="small"
            :color="checks? 'error' : 'success'"
            @click.stop="toggleMultiSelect"
        >
          {{ checks ? $t('localData.exitMultiSelect') : $t('localData.multiSelect') }}
        </v-btn>

        <v-btn
            prepend-icon="mdi-download"
            size="small"
            color="success"
            @click.stop="batchExport"
            :loading="exportingSelected"
            :disabled="selectedIds.length === 0"
        >
          {{ $t('localData.batchExport') }}
        </v-btn>

        <v-btn
            prepend-icon="mdi-delete-sweep"
            size="small"
            color="error"
            @click.stop="openBatchDeleteDialog"
            :loading="deletingSelected"
            :disabled="selectedIds.length === 0"
        >
          {{ $t('localData.batchDelete') }}
        </v-btn>

        <v-btn
            prepend-icon="mdi-check-all"
            size="small"
            color="success"
            @click.stop="selectAll"
            :loading="selectingAll"
        >
          {{ $t('localData.selectAll') }}
        </v-btn>

        <v-btn
            prepend-icon="mdi-close-circle-multiple-outline"
            size="small"
            color="error"
            @click.stop="clearAll"
        >
          {{ $t('localData.clearAll') }}
        </v-btn>
      </div>
    </transition>

    <v-btn
        key="fixed"
        class="local-action-toggle"
        size="large"
        :color="open ? 'info' : 'success'"
        icon
        elevation="8"
        @click.stop="open = !open"
    >
      <v-icon>{{ open ? 'mdi-close' : 'mdi-folder-multiple-plus-outline' }}</v-icon>
    </v-btn>
  </div>

  <ScrollRail target=".mc-blueprint-list" position="right" offset="0px" />
  </div>
</template>

<style scoped>
/* Definite-height column: the filter panel takes its natural size and the
   blueprint card fills the rest, so expanding the filter compresses the list
   instead of clipping it against the fixed full-screen page. */
.schematics-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.list-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 96px 6px 12px; /* right side clears the floating batch FAB */
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-surface-container), calc(var(--surface-alpha-raised, 1) * 0.45));
}

.page-indicator {
  min-width: 56px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.toolbar-divider {
  align-self: stretch;
  margin: 2px 0;
}

.toolbar-select {
  max-width: 168px;
  flex: 0 1 auto;
}

.toolbar-select--narrow {
  max-width: 86px;
}

.toolbar-jump {
  max-width: 88px;
}

.mc-blueprint-list {
  --v-list-item-padding: 12px;

  height: 100%;
  overflow-y: auto;
  contain: layout paint;
  overscroll-behavior: contain;
}
.mc-blueprint-list--large .blueprint-item {
  content-visibility: auto;
  contain-intrinsic-size: 112px;
}
.schematics-drawer {
  isolation: isolate;
}
.drawer-toggle {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: flex-end;
  padding: 2px 8px 0;
}
.nav-list {
  padding: 0 8px;
}

.nav-item {
  min-height: 56px;
  margin: 4px 0;
  transition: background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
}

.nav-item[draggable="true"] {
  cursor: grab;
}
.nav-item[draggable="true"]:active {
  cursor: grabbing;
}



.nav-item.active-item {
  background: rgba(var(--v-theme-primary), 0.08);
  position: relative;
}

.nav-item.active-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 24px;
  width: 3px;
  background: rgb(var(--v-theme-primary));
  border-radius: 0 2px 2px 0;
}
.blueprint-item {
  border-radius: 8px;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.blueprint-item.drag-over {
  /* outline instead of border: same highlight without shifting item layout */
  outline: 2px dashed rgb(var(--v-theme-primary));
  outline-offset: -2px;
  box-shadow: 0 0 10px rgba(var(--v-theme-primary), 0.35);
  transition: outline-color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
}

.blueprint-item.selected-item {
  background-color: rgba(var(--v-theme-primary), 0.08); /* 选中高亮 */
  /* inset bar: keeps the 4px accent without shifting item content */
  box-shadow: inset 4px 0 0 rgb(var(--v-theme-primary));
}
.cursor-grab {
  cursor: grab;
}
.cursor-grab:active {
  cursor: grabbing;
}
.blueprint-item.drag-ready {
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.blueprint-item.drag-ready:hover {
  background: rgba(var(--v-theme-primary), 0.05);
}

.local-action-menu {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1800;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  pointer-events: none;
}

.local-action-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(100vw - 104px);
  padding: 10px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
}

.local-action-panel :deep(.v-btn) {
  justify-content: flex-start;
  min-width: 156px;
}

.local-action-toggle {
  flex: 0 0 auto;
  pointer-events: auto;
}

.local-action-panel-enter-active,
.local-action-panel-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.local-action-panel-enter-from,
.local-action-panel-leave-to {
  opacity: 0;
  transform: translateX(12px) scale(0.98);
}

</style>
