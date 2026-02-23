<script setup lang="ts">

import {isLeaving, navigationGuard} from "../modules/navigation.ts";
import {opacity} from "../modules/theme.ts";
import {ref} from "vue";
import {onBeforeRouteLeave} from "vue-router";
import mapImage2d from "../units/others/mapImage2d.vue";
import redStoneMusic from "../units/others/redStoneMusic.vue";
import ModelToSchem from "../units/others/modelToSchem.vue";
import {mapArtData} from "../modules/map_art/map_art_data.ts";
import { useI18n } from 'vue-i18n';

const { t } = useI18n()
const active = ref('img')

onBeforeRouteLeave(navigationGuard)
</script>

<template class="page-wrapper">
  <v-row no-gutters
         class="mb-4 animate-row"
         :class="{ 'animate-row-out': isLeaving }"
  >
    <v-col>
      <v-card class="mx-auto overflow-auto h-auto v-theme--custom text-primary" :style="{ '--surface-alpha': opacity }" elevation="4" >
        <v-toolbar density="compact" class="bg-blue-grey-lighten-5 pa-3" :style="{ '--surface-alpha': opacity + 0.2 }">
          <v-toolbar-title>
            <v-icon icon="mdi-package-variant text-medium-emphasis" class="mr-2"></v-icon>
            <span class="text-h5 text-medium-emphasis">{{ t('others.title') }}</span>
          </v-toolbar-title>
          <v-divider vertical inset class="mx-4"/>

          <v-tabs v-model="active" align-tabs="center" color="blue-lighten-1">
            <v-tab value="img" class="text-medium-emphasis">{{ t('others.tabs.mapArt') }}</v-tab>
            <v-tab value="model" class="text-medium-emphasis">{{ t('others.tabs.ModelToSchem') }}</v-tab>
            <v-tab value="music" class="text-medium-emphasis">{{ t('others.tabs.redstoneMusic') }}</v-tab>
          </v-tabs>
        </v-toolbar>
        <v-window v-model="active">
          <v-window-item value="img">
            <map-image2d v-if="mapArtData && active === 'img'" />
          </v-window-item>
          <v-window-item value="model">
            <model-to-schem v-if="active === 'model'" />
          </v-window-item>
          <v-window-item value="music">
            <redStoneMusic v-if="active === 'music'" />
          </v-window-item>
        </v-window>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>

</style>