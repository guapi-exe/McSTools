<script setup lang="ts">
import {defineAsyncComponent} from 'vue';
import {selectedSite} from '../../modules/web_schematic/web_data';
const McsLibrary = defineAsyncComponent(() => import('./McsLibrary.vue'));
const CmsLibrary = defineAsyncComponent(() => import('./CmsLibrary.vue'));
</script>

<template>
  <div class="web-library">
    <KeepAlive :max="2">
      <McsLibrary v-if="selectedSite === 'MCS'" />
      <CmsLibrary v-else-if="selectedSite === 'CMS'" />
    </KeepAlive>
  </div>
</template>

<style scoped>
.web-library { height: 100%; min-height: 0; display: flex; flex-direction: column; }
</style>
