<script setup lang="ts">

import {navigationGuard} from "../modules/navigation.ts";
import {defineAsyncComponent, onMounted, ref, watch} from "vue";
import {onBeforeRouteLeave} from "vue-router";
import {ensureMapArtData, mapArtData} from "../modules/map_art/map_art_data.ts";
import { useI18n } from 'vue-i18n';

// These tabs contain image/3D/audio tooling and are not needed to render the
// others page shell.  Split them so opening another left-nav page does not
// parse all three tools up front.
const mapImage2d = defineAsyncComponent(() => import("../units/others/mapImage2d.vue"))
const redStoneMusic = defineAsyncComponent(() => import("../units/others/redStoneMusic.vue"))
const ModelToSchem = defineAsyncComponent(() => import("../units/others/modelToSchem.vue"))
const BlueprintBatchConverter = defineAsyncComponent(() => import("../units/others/BlueprintBatchConverter.vue"))

const { t } = useI18n()
const active = ref('img')
const mapArtReady = ref(Boolean(mapArtData.value?.length))
const mapArtLoading = ref(false)
const mapArtError = ref(false)

const loadMapArtData = async () => {
  if (mapArtReady.value || mapArtLoading.value) return

  mapArtLoading.value = true
  mapArtError.value = false
  try {
    await ensureMapArtData()
    mapArtReady.value = true
  } catch {
    mapArtError.value = true
  } finally {
    mapArtLoading.value = false
  }
}

watch(active, (value) => {
  if (value === 'img' || value === 'model') {
    window.requestAnimationFrame(() => void loadMapArtData())
  }
})

onMounted(() => {
  if (active.value === 'img') {
    window.requestAnimationFrame(() => void loadMapArtData())
  }
})

onBeforeRouteLeave(navigationGuard)
</script>

<template>
  <div class="page-view">
  <v-row no-gutters
         class="mb-4 animate-row"
  >
    <v-col>
      <v-card class="mx-auto overflow-auto h-auto v-theme--custom text-primary" elevation="2" >
        <v-toolbar density="compact" class="bg-surface-container pa-3">
          <v-toolbar-title>
            <v-icon icon="mdi-package-variant text-medium-emphasis" class="mr-2"></v-icon>
            <span class="text-h6 text-medium-emphasis">{{ t('others.title') }}</span>
          </v-toolbar-title>
          <v-divider vertical inset class="mx-4"/>

          <v-tabs v-model="active" align-tabs="center" color="blue-lighten-1">
            <v-tab value="img" class="text-medium-emphasis">{{ t('others.tabs.mapArt') }}</v-tab>
            <v-tab value="model" class="text-medium-emphasis">{{ t('others.tabs.ModelToSchem') }}</v-tab>
            <v-tab value="music" class="text-medium-emphasis">{{ t('others.tabs.redstoneMusic') }}</v-tab>
            <v-tab value="batch" class="text-medium-emphasis">{{ t('others.tabs.batchConvert') }}</v-tab>
          </v-tabs>
        </v-toolbar>
        <v-window v-model="active" transition="fade-transition" reverse-transition="fade-transition">
        <v-window-item value="img">
            <div v-if="!mapArtReady" class="tool-panel-loading">
              <v-progress-circular v-if="mapArtLoading" indeterminate color="info" size="32" />
              <v-alert v-else-if="mapArtError" variant="tonal" color="error" density="compact">
                地图画方块数据加载失败，请重试。
                <template #append>
                  <v-btn size="small" variant="text" @click="loadMapArtData">重试</v-btn>
                </template>
              </v-alert>
            </div>
            <map-image2d v-else-if="active === 'img'" />
          </v-window-item>
        <v-window-item value="model">
            <div v-if="!mapArtReady" class="tool-panel-loading">
              <v-progress-circular v-if="mapArtLoading" indeterminate color="info" size="32" />
              <v-alert v-else-if="mapArtError" variant="tonal" color="error" density="compact">
                地图画方块数据加载失败，请重试。
                <template #append>
                  <v-btn size="small" variant="text" @click="loadMapArtData">重试</v-btn>
                </template>
              </v-alert>
            </div>
            <model-to-schem v-else-if="active === 'model'" />
          </v-window-item>
        <v-window-item value="music">
            <redStoneMusic v-if="active === 'music'" />
          </v-window-item>
        <v-window-item value="batch">
            <KeepAlive><BlueprintBatchConverter v-if="active === 'batch'"/></KeepAlive>
          </v-window-item>
        </v-window>
      </v-card>
    </v-col>
  </v-row>
  </div>
</template>

<style scoped>

.tool-panel-loading {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

</style>
