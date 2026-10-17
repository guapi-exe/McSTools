<script setup lang="ts">
import {defineAsyncComponent, onMounted, ref, watch} from 'vue'
import {onBeforeRouteLeave, useRouter} from "vue-router";
import {navigationGuard} from "../modules/navigation.ts";
import { activeTab } from "../modules/layout.ts"
import 'vue-json-pretty/lib/styles.css';
import toolsSchematic from '../units/tools/toolsSchematic.vue';
import { useI18n } from 'vue-i18n';

// Keep the first (common) tool in the route chunk, and load expensive panels
// only when the user opens them.  In particular this keeps Three.js/ECharts
// parsing and component setup off the initial tools-page navigation path.
const toolsHistory = defineAsyncComponent(() => import('../units/tools/toolsHistory.vue'))
const toolsSplit = defineAsyncComponent(() => import('../units/tools/toolsSplit.vue'))
const toolsReplace = defineAsyncComponent(() => import('../units/tools/toolsReplace.vue'))
const toolsStats = defineAsyncComponent(() => import('../units/tools/toolsStats.vue'))
const toolsData = defineAsyncComponent(() => import('../units/tools/toolsData.vue'))
const toolsConvert = defineAsyncComponent(() => import('../units/tools/toolsConvert.vue'))
const ToolsThreeD = defineAsyncComponent(() => import('../units/tools/toolsThreeD.vue'))

import {
  schematic_id,
  fetch_data,
  schematicData,
  schematicRequirements,
  convertData,
  uniqueBlocks,
  historyRecordData, activeTools
} from "../modules/tools_data.ts"

const { t } = useI18n()
const router = useRouter()

// VWindow uses v-show for inactive panels, so mounting every tool at once
// makes entering the tools page needlessly expensive.  Create a panel on its
// first visit and retain it afterwards so switching tabs does not lose form
// state.  The 3D panel is handled separately below and is torn down when it
// is not active to stop WebGL work in the background.
const loadedToolTabs = ref<Record<string, boolean>>({schematic: true})
watch(activeTools, (value) => {
    if (value && value !== 'threeD') {
        loadedToolTabs.value[value] = true
    }
}, {immediate: true})

onBeforeRouteLeave(navigationGuard)
onMounted(async() => {
    // Selecting a blueprint already populated the shared tool store.  Avoid
    // refetching all requirements/history every time the left navigation
    // returns to this cached page.
    if (schematic_id.value != undefined && !schematicData.value){
        await fetch_data(schematic_id.value)
    }
})

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
            <v-icon icon="mdi-tools" class="mr-2 text-medium-emphasis"></v-icon>
            <span class="text-h6 text-medium-emphasis">{{ t('tools.title') }}</span>
            <v-chip
                v-if="schematic_id != undefined"
                color="orange-lighten-4"
                class="text-orange-darken-4 "
            >
              <v-icon start icon="mdi-cube"></v-icon>
              {{ t('tools.schematicId', { id: schematic_id }) }}
            </v-chip>
            <v-chip
                v-else
                color="red-orange-darken-4 text-medium-emphasis"
            >
              <v-icon start icon="mdi-cube"></v-icon>
              {{ t('tools.noSchematic') }}
            </v-chip>
          </v-toolbar-title>
          <v-btn class="text-medium-emphasis" variant="text" icon="mdi-cloud-upload" :title="t('tools.upload')" @click="router.push('/home');activeTab = 'home'"/>

          <v-divider vertical inset class="mx-4"/>

          <v-tabs v-model="activeTools"
                  align-tabs="center"
                  color="blue-lighten-1"
                  :disabled="schematic_id == undefined"
          >
            <v-tab value="schematic" class="text-medium-emphasis">{{ t('tools.tabs.schematic') }}</v-tab>
            <v-tab value="history" class="text-medium-emphasis">{{ t('tools.tabs.history') }}</v-tab>
            <v-tab value="split" class="text-medium-emphasis">{{ t('tools.tabs.split') }}</v-tab>
            <v-tab value="replace" class="text-medium-emphasis">{{ t('tools.tabs.replace') }}</v-tab>
            <v-tab value="convert" class="text-medium-emphasis">{{ t('tools.tabs.convert') }}</v-tab>
            <v-tab value="data" class="text-medium-emphasis">{{ t('tools.tabs.data') }}</v-tab>
            <v-tab value="stats" class="text-medium-emphasis">{{ t('tools.tabs.stats') }}</v-tab>
            <v-tab value="threeD" class="text-medium-emphasis">{{ t('tools.tabs.threeD') }}</v-tab>
          </v-tabs>
        </v-toolbar>
        <!-- No transition on purpose: the tool panels are heavy (stats table,
             JSON editor) and the editor should switch tabs instantly. -->
        <v-window v-model="activeTools" :transition="false" :reverse-transition="false">
          <v-window-item value="schematic">
            <toolsSchematic v-if="loadedToolTabs.schematic" :data="schematicData"/>
          </v-window-item>
          <v-window-item value="history">
            <toolsHistory v-if="loadedToolTabs.history" :data="historyRecordData"/>
          </v-window-item>
          <v-window-item value="split">
            <toolsSplit v-if="loadedToolTabs.split" />
          </v-window-item>
          <v-window-item value="replace">
            <toolsReplace v-if="loadedToolTabs.replace"
                :data="schematicRequirements"
                :blocks="uniqueBlocks"
            />
          </v-window-item>
          <v-window-item value="convert">
            <toolsConvert v-if="loadedToolTabs.convert" :data="convertData"/>
          </v-window-item>
          <v-window-item value="data">
            <toolsData v-if="loadedToolTabs.data"/>
          </v-window-item>
          <v-window-item value="stats">
            <toolsStats v-if="loadedToolTabs.stats" :data="schematicRequirements"/>
          </v-window-item>
          <v-window-item value="threeD">
            <tools-three-d v-if="activeTools === 'threeD'" />
          </v-window-item>
        </v-window>
      </v-card>
    </v-col>
  </v-row>
  </div>
</template>

<style scoped>

</style>
