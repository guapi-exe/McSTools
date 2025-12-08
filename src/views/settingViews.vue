<script setup lang="ts">

import {isLeaving, navigationGuard} from "../modules/navigation.ts";
import {opacity} from "../modules/theme.ts";
import {ref} from "vue";
import {onBeforeRouteLeave} from "vue-router";
import baseSetting from "../units/settings/baseSetting.vue";
import resourceSetting from "../units/settings/resourceSetting.vue";
import { useI18n } from 'vue-i18n';

const { t: $t } = useI18n()
const active = ref(0)

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
            <v-icon icon="mdi-cog-outline" class="mr-2"></v-icon>
            <span class="text-h5 text-medium-emphasis">{{ $t('settings.title') }}</span>
          </v-toolbar-title>
          <v-divider vertical inset class="mx-4"/>

          <v-tabs v-model="active" align-tabs="center" color="blue-lighten-1">
            <v-tab value="base" class="text-medium-emphasis">基础设置</v-tab>
            <v-tab value="resource" class="text-medium-emphasis">资源管理</v-tab>
          </v-tabs>
        </v-toolbar>
        <v-window v-model="active">
          <v-window-item value="base">
            <baseSetting />
          </v-window-item>
          <v-window-item value="resource">
            <resourceSetting />
          </v-window-item>
        </v-window>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>

</style>