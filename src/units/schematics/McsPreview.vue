<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {mcsSessionRevision} from '../../modules/web_schematic/mcs_api';

const props = defineProps<{id: string; version: number; src?: string; authenticated: boolean}>();
const host = ref<HTMLElement>();
const url = ref<string>();
const failed = ref(false);
const visible = ref(false);
let observer: IntersectionObserver | undefined;
let epoch = 0;

async function load() {
  const request = ++epoch;
  url.value = undefined;
  failed.value = false;
  if (!visible.value || !props.src || !props.version) return;
  if (!props.authenticated) { url.value = props.src; return; }
  try {
    const result = await invoke<string>('mcs_api_preview', {blueprintId: props.id, version: props.version});
    if (epoch === request) url.value = result;
  } catch { if (epoch === request) failed.value = true; }
}
watch(() => [props.id, props.version, props.src, props.authenticated, visible.value, mcsSessionRevision.value], load);
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      visible.value = true;
      observer?.disconnect();
    }
  }, {rootMargin: '120px'});
  if (host.value) observer.observe(host.value);
});
onBeforeUnmount(() => { epoch++; observer?.disconnect(); url.value = undefined; });
</script>

<template>
  <div ref="host" class="mcs-preview" aria-hidden="true">
    <img v-if="url && !failed" :src="url" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="failed = true">
    <v-icon v-else icon="mdi-cube-outline" size="32" class="text-medium-emphasis" />
  </div>
</template>

<style scoped>
.mcs-preview { width: 88px; height: 88px; flex-shrink: 0; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: rgba(var(--v-theme-on-surface), .04); }
.mcs-preview img { width: 100%; height: 100%; object-fit: cover; }
</style>
