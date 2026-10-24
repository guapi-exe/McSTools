<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch} from 'vue';
import dayjs from 'dayjs';
import McsPreview from './McsPreview.vue';
import {fetchMcSchematics, fetchMcsCategories, fetchMcsVersion, fetchMcsVersions, importMcsVersion, mcsConnected, mcsErrorMessage, mcsSessionRevision, mcsConnectionDialog, mcsStatusLabel} from '../../modules/web_schematic/mcs_api';
import {useRoute} from 'vue-router';
import {blueprintWebUrl, formatLabel, mergeLibraryItems, sourceFormats} from '../../modules/web_schematic/mcs_api_contract';
import type {McsCategory, McsCollection, McsFilters, McsLibraryItem, McsVersion, McsVersionDetail} from '../../modules/web_schematic/mcs_api_contract';
import {openLink, toast} from '../../modules/others';
import {markLocalSchematicsDirty} from '../../modules/upload_schematic';
import {fetchUserData} from '../../modules/user_data';

const collection = ref<McsCollection>('public');
const route = useRoute();
watch(() => route.query.collection, value => { if (['public', 'mine', 'favourites'].includes(String(value))) collection.value = value as McsCollection; }, {immediate: true});
const filters = reactive<McsFilters>({keyword: '', sort: 'latest', featured: false, category: '', format: '', gameVersion: ''});
const items = shallowRef<McsLibraryItem[]>([]);
const categories = shallowRef<McsCategory[]>([]);
const loading = ref(false);
const error = ref('');
const categoryError = ref(false);
const totalCount = ref<number>();
const hasMore = ref(true);
const expanded = ref(false);
const list = ref<any>();
const authenticated = computed(() => collection.value !== 'public');
const needsKey = computed(() => authenticated.value && !mcsConnected.value);
let cursor: string | undefined;
let page = 1;
let generation = 0;
let debounce: ReturnType<typeof setTimeout> | undefined;
let retryAt = 0;
let replaceNextPage = true;
let scheduled = false;

const sorts = [{title: '最新更新', value: 'latest'}, {title: '最早更新', value: 'oldest'}, {title: '热门优先', value: 'popular'}, {title: '较少热度优先', value: 'least_popular'}];
const gameVersions = [
  {title: '基岩版', value: 'bedrock'}, {title: 'Java 1.7.10', value: 'java-1.7.10'},
  ...Array.from({length: 10}, (_, i) => ({title: `Java 1.${i + 12}`, value: `java-1.${i + 12}`})),
  {title: '版本未知', value: 'unknown'},
];

function invalidate() {
  generation++;
  clearTimeout(debounce);
  loading.value = false;
  cursor = undefined;
  page = 1;
  hasMore.value = true;
  totalCount.value = undefined;
  error.value = '';
  replaceNextPage = true;
}

async function loadMore(reset = false) {
  if (needsKey.value || loading.value || (!reset && !hasMore.value)) return;
  clearTimeout(debounce);
  scheduled = false;
  reset = reset || replaceNextPage;
  if (Date.now() < retryAt) {
    error.value = `请求过于频繁，请约 ${Math.ceil((retryAt - Date.now()) / 1000)} 秒后重试`;
    return;
  }
  const request = generation;
  const requestedCollection = collection.value;
  const previousCursor = cursor;
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchMcSchematics(requestedCollection, {...filters}, reset ? undefined : cursor, reset ? 1 : page);
    if (request !== generation) return;
    items.value = reset ? result.items : mergeLibraryItems(items.value, result.items);
    replaceNextPage = false;
    totalCount.value = result.totalCount;
    cursor = result.nextCursor;
    hasMore.value = requestedCollection === 'mine'
      ? page < (result.totalPages ?? page)
      : !!cursor && cursor !== previousCursor;
    page++;
    if (reset) list.value?.scrollToIndex(0);
  } catch (cause) {
    if (request !== generation) return;
    error.value = mcsErrorMessage(cause);
    const retrySeconds = (cause as {retryAfterSeconds?: number})?.retryAfterSeconds;
    if (retrySeconds) retryAt = Date.now() + retrySeconds * 1000;
  } finally {
    if (request === generation) loading.value = false;
  }
}

function reload(delay = 0, clear = false) {
  invalidate();
  if (clear) items.value = [];
  scheduled = true;
  debounce = setTimeout(() => void loadMore(true), delay);
}

function onScroll(event: Event) {
  const element = event.target as HTMLElement;
  if (!scheduled && !error.value && element.scrollHeight - element.scrollTop - element.clientHeight < 360) void loadMore();
}

async function loadCategories() {
  categoryError.value = false;
  try { categories.value = await fetchMcsCategories(); }
  catch { categoryError.value = true; }
}

watch(() => filters.keyword, () => reload(300));
watch(() => [filters.sort, filters.featured, filters.category, filters.format, filters.gameVersion], () => reload());
watch(collection, () => { closeDetails(); reload(0, true); });
watch(mcsSessionRevision, () => { closeDetails(); reload(0, true); });

// A single app-level dialog owns the connection, including the home/sidebar.

const selected = shallowRef<McsLibraryItem>();
const detailDialog = ref(false);
const versions = shallowRef<McsVersion[]>([]);
const selectedVersion = ref<number>();
const detail = shallowRef<McsVersionDetail>();
const detailsLoading = ref(false);
const versionsLoading = ref(false);
const detailsError = ref('');
const versionsError = ref('');
const versionsCursor = ref<string>();
const importing = ref<string>();
let detailEpoch = 0;
let versionEpoch = 0;

function closeDetails() {
  detailEpoch++; versionEpoch++;
  detailDialog.value = false; selected.value = undefined; detail.value = undefined;
  versions.value = []; versionsCursor.value = undefined;
  detailsLoading.value = false; versionsLoading.value = false;
}

async function loadVersions() {
  if (!selected.value || versionsLoading.value) return;
  const request = versionEpoch;
  versionsLoading.value = true;
  versionsError.value = '';
  try {
    const result = await fetchMcsVersions(selected.value.id, authenticated.value, versionsCursor.value);
    if (request !== versionEpoch) return;
    if (!Array.isArray(result.items)) throw new Error('版本列表格式不正确');
    versions.value = [...new Map([...versions.value, ...result.items].map(item => [item.number, item])).values()];
    versionsCursor.value = result.nextCursor || undefined;
  } catch (cause) { if (request === versionEpoch) versionsError.value = mcsErrorMessage(cause); }
  finally { if (request === versionEpoch) versionsLoading.value = false; }
}

async function loadDetail() {
  if (!selected.value || !selectedVersion.value) return;
  const request = ++detailEpoch;
  detail.value = undefined;
  detailsLoading.value = true;
  detailsError.value = '';
  try {
    const result = await fetchMcsVersion(selected.value.id, selectedVersion.value, authenticated.value);
    if (request === detailEpoch) detail.value = result;
  } catch (cause) { if (request === detailEpoch) detailsError.value = mcsErrorMessage(cause); }
  finally { if (request === detailEpoch) detailsLoading.value = false; }
}

function openDetails(item: McsLibraryItem) {
  closeDetails();
  selected.value = item;
  selectedVersion.value = item.version;
  versions.value = [{number: item.version, sourceFormat: item.sourceFormat!, createdAt: item.updatedAt}];
  detailDialog.value = true;
  void loadVersions();
  void loadDetail();
}

async function importSelected() {
  if (!selected.value || !selectedVersion.value || !detail.value || importing.value) return;
  const item = selected.value;
  importing.value = item.id;
  detailsError.value = '';
  try {
    const result = await importMcsVersion(item.id, selectedVersion.value, authenticated.value);
    markLocalSchematicsDirty();
    void fetchUserData();
    toast.success(`已导入本地蓝图库：${result.filename}`);
    closeDetails();
  } catch (cause) { detailsError.value = mcsErrorMessage(cause); }
  finally { importing.value = undefined; }
}

const formatTime = (value: string) => dayjs(value).isValid() ? dayjs(value).format('YYYY/MM/DD HH:mm') : '时间未知';
const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;
onMounted(() => { void loadMore(true); void loadCategories(); });
onBeforeUnmount(() => { invalidate(); closeDetails(); });
</script>

<template>
  <section class="mcs-library" aria-label="MCS 在线蓝图库">
    <div class="library-controls pa-3">
      <div class="d-flex align-center flex-wrap ga-2 mb-3">
        <v-btn-toggle v-model="collection" mandatory density="compact" color="info" variant="tonal" divided aria-label="蓝图范围">
          <v-btn value="public" size="small">公开蓝图</v-btn>
          <v-btn value="mine" size="small">我的蓝图</v-btn>
          <v-btn value="favourites" size="small">我的收藏</v-btn>
        </v-btn-toggle>
        <v-spacer />
        <v-btn size="small" variant="text" prepend-icon="mdi-account-circle-outline" @click="mcsConnectionDialog = true">{{ mcsStatusLabel }}</v-btn>
        <v-btn size="small" variant="text" icon="mdi-refresh" aria-label="刷新蓝图" :disabled="loading || needsKey" @click="reload()" />
      </div>
      <div v-if="collection !== 'favourites'" class="d-flex ga-2 align-center">
        <v-text-field v-model="filters.keyword" label="搜索名称或简介" prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" hide-details clearable maxlength="120" />
        <v-btn variant="tonal" size="small" :aria-expanded="expanded" @click="expanded = !expanded" prepend-icon="mdi-filter-variant">筛选</v-btn>
      </div>
      <v-expand-transition>
        <div v-if="expanded && collection !== 'favourites'" class="filter-grid mt-3">
          <v-select v-model="filters.category" :items="categories" item-title="name" item-value="slug" label="分类" clearable density="compact" variant="outlined" hide-details />
          <v-select v-model="filters.format" :items="sourceFormats" label="文件格式" clearable density="compact" variant="outlined" hide-details />
          <v-select v-model="filters.gameVersion" :items="gameVersions" label="来源游戏版本" clearable density="compact" variant="outlined" hide-details />
          <v-select v-model="filters.sort" :items="sorts" :disabled="collection !== 'public'" label="排序" density="compact" variant="outlined" hide-details />
          <v-checkbox v-if="collection === 'public'" v-model="filters.featured" label="只看优选蓝图" density="compact" hide-details />
          <v-btn v-if="categoryError" variant="text" color="warning" size="small" @click="loadCategories">分类加载失败，重试</v-btn>
        </div>
      </v-expand-transition>
    </div>
    <v-progress-linear :indeterminate="loading" :active="loading" height="2" color="info" class="flex-grow-0" />
    <v-alert v-if="needsKey" type="info" variant="tonal" class="ma-3" density="compact">此范围需要 account:read 权限。连接 API Key 后可只读查看，发布和修改请前往网站。</v-alert>
    <v-alert v-else-if="error" type="error" variant="tonal" class="ma-3" density="compact" role="alert">
      {{ error }}
      <template #append><v-btn size="small" variant="text" @click="loadMore(!items.length)">重试</v-btn></template>
    </v-alert>
    <v-virtual-scroll v-if="!needsKey && items.length" ref="list" :items="items" :item-height="152" class="blueprint-virtual-list" @scroll.passive="onScroll">
      <template #default="{ item }">
        <article :key="item.id" class="blueprint-row" :data-blueprint-id="item.id">
          <McsPreview :id="item.id" :version="item.version" :src="item.previewUrl" :authenticated="authenticated" />
          <div class="blueprint-info">
            <div class="d-flex align-center ga-2">
              <h3 class="text-subtitle-1 font-weight-medium text-truncate" :title="item.title">{{ item.title }}</h3>
              <v-chip v-if="item.featured" size="x-small" color="amber-darken-2">优选</v-chip>
              <v-chip v-if="item.visibility === 'private'" size="x-small">私有</v-chip>
            </div>
            <p class="text-body-2 text-medium-emphasis text-truncate mb-2" :title="item.description">{{ item.description || '暂无简介' }}</p>
            <div class="d-flex align-center flex-wrap ga-2 text-caption text-medium-emphasis">
              <span v-if="item.author"><v-icon size="14" icon="mdi-account-outline" /> {{ item.author }}</span>
              <span>{{ formatLabel(item.sourceFormat) }} · v{{ item.version || '?' }}</span>
              <span v-if="item.category">{{ item.category }}</span>
              <span v-if="item.downloads !== undefined"><v-icon size="14" icon="mdi-download-outline" /> {{ item.downloads }}</span>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">{{ formatTime(item.updatedAt) }}<span v-if="item.gameVersion && item.gameVersion !== 'unknown'"> · {{ item.gameVersion }}</span></div>
          </div>
          <div class="d-flex flex-column ga-2 blueprint-actions">
            <v-btn size="small" variant="tonal" color="info" :disabled="!item.available || !!importing" :loading="importing === item.id" @click="openDetails(item)">选择版本导入</v-btn>
            <v-btn size="small" variant="text" :disabled="!item.slug" @click="openLink(blueprintWebUrl(item))">前往网站</v-btn>
          </div>
        </article>
      </template>
    </v-virtual-scroll>
    <div v-else-if="!needsKey" class="empty-library text-medium-emphasis">
      <v-progress-circular v-if="loading" indeterminate color="info" size="28" />
      <span v-else-if="!error">{{ collection === 'favourites' ? '还没有收藏的蓝图' : '没有符合条件的蓝图' }}</span>
    </div>
    <footer v-if="!needsKey" class="d-flex align-center justify-space-between px-3 py-2 text-caption text-medium-emphasis">
      <span>已加载 {{ items.length }}<template v-if="totalCount !== undefined"> / {{ totalCount }}</template> 项</span>
      <v-btn v-if="hasMore" size="small" variant="text" :loading="loading" @click="loadMore()">加载更多</v-btn>
      <span v-else>已加载全部</span>
    </footer>

    <v-dialog :model-value="detailDialog" max-width="640" :persistent="!!importing" @update:model-value="value => { if (!value) closeDetails(); }">
      <v-card :title="selected?.title || '选择蓝图版本'">
        <v-card-text>
          <v-select v-model="selectedVersion" :items="versions" :item-title="version => `v${version.number} · ${formatLabel(version.sourceFormat)} · ${formatTime(version.createdAt)}`" item-value="number" label="导入网站版本" variant="outlined" density="comfortable" :loading="versionsLoading" :disabled="!!importing" @update:model-value="loadDetail" />
          <v-alert v-if="versionsError" type="warning" variant="tonal" density="compact" class="mb-3">{{ versionsError }} <v-btn variant="text" size="small" @click="loadVersions">重试版本列表</v-btn></v-alert>
          <v-btn v-if="versionsCursor" size="small" variant="text" :loading="versionsLoading" @click="loadVersions">加载更早版本</v-btn>
          <v-progress-linear v-if="detailsLoading" indeterminate color="info" class="mb-3" />
          <div v-if="detail" class="text-body-2">
            <p class="mb-2">原文件：{{ detail.originalFilename }}（{{ fileSize(detail.originalSourceByteSize) }}）</p>
            <p v-if="detail.trustedAnalysis" class="mb-2">尺寸：{{ detail.trustedAnalysis.dimensions.x }} × {{ detail.trustedAnalysis.dimensions.y }} × {{ detail.trustedAnalysis.dimensions.z }} · {{ detail.trustedAnalysis.visibleBlockCount.toLocaleString() }} 个可见方块</p>
            <p v-if="detail.changelog" class="version-changelog">{{ detail.changelog }}</p>
          </div>
          <v-alert v-if="detailsError" type="error" variant="tonal" density="compact" class="mt-3">{{ detailsError }} <v-btn v-if="!detail" variant="text" size="small" @click="loadDetail">重试</v-btn></v-alert>
          <p class="text-caption text-medium-emphasis mt-4">导入所选版本的原始蓝图到本地库，不修改网站文件。需要转换格式或游戏版本时，可在导入后使用本地转换工具。</p>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn :disabled="!!importing" @click="closeDetails">取消</v-btn><v-btn color="info" :loading="!!importing" :disabled="!detail || detailsLoading" @click="importSelected">下载并导入本地</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.mcs-library { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
.library-controls { flex-shrink: 0; }
.filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.blueprint-virtual-list { flex: 1 1 0; min-height: 160px; overflow-anchor: none; }
.blueprint-row { height: 152px; display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .07); box-sizing: border-box; }
.blueprint-info { flex: 1; min-width: 0; }
.blueprint-actions { flex-shrink: 0; }
.empty-library { display: flex; align-items: center; justify-content: center; gap: 12px; flex: 1; min-height: 180px; }
.version-changelog { white-space: pre-wrap; max-height: 160px; overflow: auto; }
@media (max-width: 1100px) { .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .blueprint-row { gap: 10px; padding-inline: 12px; } }
</style>
