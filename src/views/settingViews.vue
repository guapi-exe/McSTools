<script setup lang="ts">

import {navigationGuard} from "../modules/navigation.ts";
import {ref} from "vue";
import {onBeforeRouteLeave} from "vue-router";
import baseSetting from "../units/settings/baseSetting.vue";
import resourceSetting from "../units/settings/resourceSetting.vue";
import { useI18n } from 'vue-i18n';

const { t: $t } = useI18n()
const active = ref('base')

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
            <v-icon icon="mdi-cog-outline" class="mr-2"></v-icon>
            <span class="text-h6 text-medium-emphasis">{{ $t('settings.title') }}</span>
          </v-toolbar-title>
          <v-divider vertical inset class="mx-4"/>

          <v-tabs v-model="active" align-tabs="center" color="blue-lighten-1">
            <v-tab value="base" class="text-medium-emphasis">{{ $t('settings.tabs.base') }}</v-tab>
            <v-tab value="resource" class="text-medium-emphasis">{{ $t('settings.tabs.resource') }}</v-tab>
          </v-tabs>
        </v-toolbar>
        <v-window v-model="active" transition="fade-transition" reverse-transition="fade-transition">
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
  </div>
</template>

<style scoped>

</style>