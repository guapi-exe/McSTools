<script setup lang="ts">
import {onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch} from 'vue';
import {performSearch} from '../../modules/web_schematic/get_cms';
import type {CMSchematicData, SearchParams} from '../../modules/web_schematic/get_cms';
import {openLink} from '../../modules/others';
import {safeMcsImageUrl} from '../../modules/web_schematic/mcs_api_contract';

const filters = reactive<Omit<SearchParams, 'page'>>({filter: '', sort: 'time', order: 'down'});
const items = shallowRef<CMSchematicData[]>([]);
const loading = ref(false);
const hasMore = ref(true);
const error = ref('');
let page = 0;
let generation = 0;
let timer: ReturnType<typeof setTimeout>;
let replaceNextPage = true;

async function loadMore() {
  if (loading.value || !hasMore.value) return;
  const request = generation;
  loading.value = true;
  error.value = '';
  try {
    const result = await performSearch({...filters, filter: filters.filter || '', page}, {parseHTML: true});
    if (request !== generation) return;
    if (!result.success || !Array.isArray(result.data)) throw new Error(result.error || '响应格式不正确');
    const existing = replaceNextPage ? [] : items.value;
    items.value = [...new Map([...existing, ...result.data].map(item => [item.id, item])).values()];
    replaceNextPage = false;
    page++;
    hasMore.value = result.data.length === 20;
  } catch (cause) { if (request === generation) error.value = String(cause); }
  finally { if (request === generation) loading.value = false; }
}

function reload() {
  generation++; page = 0; loading.value = false; hasMore.value = true; replaceNextPage = true;
  clearTimeout(timer);
  timer = setTimeout(() => void loadMore(), 300);
}
watch(filters, reload);
onMounted(() => void loadMore());
onBeforeUnmount(() => { generation++; clearTimeout(timer); });
</script>

<template>
  <section class="cms-library" aria-label="机械动力社区蓝图库">
    <div class="cms-filters pa-3">
      <v-text-field v-model="filters.filter" label="搜索名称或简介" prepend-inner-icon="mdi-magnify" clearable density="compact" variant="outlined" hide-details />
      <v-select v-model="filters.sort" label="排序" :items="[{title: '发布日期', value: 'time'}, {title: '产量', value: 'speed'}, {title: '下载量', value: 'download'}]" density="compact" variant="outlined" hide-details />
      <v-select v-model="filters.order" label="顺序" :items="[{title: '逆向排序', value: 'down'}, {title: '正向排序', value: 'up'}]" density="compact" variant="outlined" hide-details />
    </div>
    <v-progress-linear :active="loading" :indeterminate="loading" height="2" color="info" />
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="ma-3">{{ error }} <v-btn variant="text" size="small" @click="loadMore">重试</v-btn></v-alert>
    <v-virtual-scroll :items="items" :item-height="152" class="cms-list">
      <template #default="{ item }">
        <article class="cms-row" :key="item.id">
          <img :src="safeMcsImageUrl(item.img)" :alt="item.name" loading="lazy" decoding="async" class="cms-cover">
          <div class="cms-info">
            <h3 class="text-subtitle-1 font-weight-medium text-truncate">{{ item.name }}</h3>
            <p class="text-body-2 text-medium-emphasis text-truncate">{{ item.desc }}</p>
            <div class="text-caption text-medium-emphasis mt-2">{{ item.author }} · {{ item.type }} · {{ item.size }}</div>
            <div class="text-caption text-medium-emphasis">{{ item.time }} · 下载 {{ item.download }} · 应力 {{ item.stress }}</div>
          </div>
          <div class="d-flex flex-column ga-2">
            <v-btn disabled variant="tonal" size="small">导入</v-btn>
            <v-btn variant="text" color="info" size="small" @click="openLink('https://www.creativemechanicserver.com/detail/' + item.id + '/')">前往网站</v-btn>
          </div>
        </article>
      </template>
    </v-virtual-scroll>
    <div class="text-center pa-2"><v-btn v-if="hasMore" variant="text" size="small" :loading="loading" @click="loadMore">加载更多</v-btn><span v-else class="text-caption text-medium-emphasis">已加载全部</span></div>
  </section>
</template>

<style scoped>
.cms-library { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.cms-filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
.cms-list { flex: 1 1 0; min-height: 160px; }
.cms-row { height: 152px; box-sizing: border-box; padding: 12px 16px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .07); }
.cms-cover { width: 88px; height: 88px; object-fit: cover; border-radius: 10px; }
.cms-info { flex: 1; min-width: 0; }
</style>
