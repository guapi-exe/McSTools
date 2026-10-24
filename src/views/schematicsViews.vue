<script setup lang="ts">
import {computed, defineAsyncComponent, ref, watch} from "vue";
import {onBeforeRouteLeave, useRoute} from "vue-router";
import {navigationGuard} from "../modules/navigation.ts";
import MCS from "../static/img/fav512.png"
import CMS from "../static/img/CMS.png"
import {selectedSite} from "../modules/web_schematic/web_data.ts";
import { useI18n } from 'vue-i18n';

const LocalData = defineAsyncComponent(() => import("../units/schematics/localData.vue"))
const WebData = defineAsyncComponent(() => import("../units/schematics/webData.vue"))

const { t } = useI18n()
const active = ref<'local' | 'web'>('local')
const route = useRoute()
watch(() => route.query.source, value => {
  if (value === 'web') { selectedSite.value = 'MCS'; active.value = 'web' }
}, {immediate: true})
const loadedPanels = ref<Record<'local' | 'web', boolean>>({
  local: true,
  web: false,
})
const shouldRenderLocal = computed(() => loadedPanels.value.local)
const shouldRenderWeb = computed(() => loadedPanels.value.web)

watch(active, (value) => {
  loadedPanels.value[value] = true
}, { immediate: true })

const siteOptions = [
  {
    title: t('schematics.sites.mcs'),
    value: 'MCS',
    img: MCS
  },
  {
    title: t('schematics.sites.cms'),
    value: 'CMS',
    img: CMS
  }
]
onBeforeRouteLeave(navigationGuard)

</script>

<template>
  <div class="page-view">
  <v-row no-gutters
         class="mb-4 animate-row full-screen-card"
  >
    <v-col class="d-flex flex-column" style="flex: 1 1 0; min-height: 0;">
      <v-card class="v-theme--custom text-primary d-flex flex-column" style="flex: 1 1 0; min-height: 0;" elevation="2">
        <v-toolbar density="compact" class="bg-surface-container pa-3">
          <div class="d-flex align-center">
            <v-icon icon="mdi-warehouse text-medium-emphasis" class="mr-2"></v-icon>
            <span class="text-h6 ml-2 font-weight-medium text-medium-emphasis">{{ t('schematics.title') }}</span>
            <v-divider vertical inset class="mx-4" thickness="2"/>
          </div>

          <div class="toolbar-controls" v-if="active == 'web'">
            <v-select
                v-model="selectedSite"
                :items="siteOptions"
                :label="t('schematics.source')"
                density="comfortable"
                variant="underlined"
                class="source-select text-medium-emphasis"
                hide-details
            >
              <template v-slot:selection="{ item }">
                <div class="d-flex align-center text-medium-emphasis">
                  <v-avatar size="32" rounded="1" class="mr-2">
                    <v-img :src="item.raw.img" style="height: 32px; width: 32px" />
                  </v-avatar>
                  {{ item.title }}
                </div>
              </template>

              <template v-slot:item="{ item, props }">
                <v-list-item v-bind="props">
                  <template v-slot:prepend>
                    <v-avatar size="32" rounded="1" class="mr-2">
                      <v-img :src="item.raw.img" style="height: 32px; width: 32px" />
                    </v-avatar>
                  </template>
                </v-list-item>
              </template>
            </v-select>

          </div>
          <v-spacer/>

          <div class="d-flex align-center">
            <v-tabs
                v-model="active"
                color="blue-lighten-1"
                slider-color="blue-darken-2"
            >
              <v-tab
                  value="local"
                  class="text-medium-emphasis"
              >{{ t('schematics.local') }}</v-tab>
              <v-tab
                  value="web"
                  class="text-medium-emphasis"
              >{{ t('schematics.web') }}</v-tab>
            </v-tabs>
            <v-btn
                variant="text"
                icon="mdi-cloud-upload"
                :title="t('schematics.upload')"
                class="ml-4"
                size="small"
            />
          </div>
        </v-toolbar>
        <v-window v-model="active" class="schem-window" transition="fade-transition" reverse-transition="fade-transition">
          <v-window-item value="local">
            <Suspense>
              <template #default>
                <keep-alive>
                  <LocalData v-if="shouldRenderLocal" />
                </keep-alive>
              </template>
              <template #fallback>
                <div class="tab-loading">
                  <v-progress-circular indeterminate color="info" size="28" />
                </div>
              </template>
            </Suspense>
          </v-window-item>
          <v-window-item value="web">
            <Suspense>
              <template #default>
                <keep-alive>
                  <WebData v-if="shouldRenderWeb" />
                </keep-alive>
              </template>
              <template #fallback>
                <div class="tab-loading">
                  <v-progress-circular indeterminate color="info" size="28" />
                </div>
              </template>
            </Suspense>
          </v-window-item>
        </v-window>

      </v-card>
    </v-col>
  </v-row>
  </div>
</template>

<style scoped>

/* The window fills the card below the toolbar; container and items pin to
   100% so inner pages (localData) get a definite height. Vuetify only sets
   an inline container height during tab transitions, so this is safe. */
.schem-window {
  flex: 1 1 0;
  min-height: 0;
}

.schem-window :deep(.v-window__container),
.schem-window :deep(.v-window-item) {
  height: 100%;
}

.toolbar-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 280px;
  min-width: 180px;
  max-width: 480px;
  margin-left: 16px;
}

.source-select {
  width: 100%;

  :deep(.v-field__prepend-inner) {
    padding-right: 8px;
  }
}
.v-card-item,
.v-window {
  flex: 1;
  min-height: 0;
}

.v-window-item {
  overflow-y: auto;
  height: 100%;
}

.v-toolbar {
  flex-shrink: 0;
}

.tab-loading {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
