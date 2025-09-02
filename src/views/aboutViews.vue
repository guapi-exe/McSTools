<script setup lang="ts">
import {isLeaving, navigationGuard} from "../modules/navigation.ts";
import fav from  "../static/img/fav512.png"
import {opacity} from "../modules/theme.ts";
import {onBeforeRouteLeave} from "vue-router";
import {appData} from "../modules/app_data.ts";
import tauri from "../static/img/tauri.png"
import guapi from "../static/img/guapi.png"
import {openLink} from "../modules/others.ts";
import ifdian from "../static/img/ifdian.png"
import {checkUpdate, chuckLoading} from "../modules/chuck_update.ts";
import { useI18n } from 'vue-i18n'
const { t } = useI18n()


onBeforeRouteLeave(navigationGuard)

</script>

<template class="page-wrapper">
  <v-row no-gutters class="mb-4 animate-row" :class="{ 'animate-row-out': isLeaving }">
    <v-col class="mb-4" cols="12">
      <v-card
          class="mx-auto"
          elevation="4"
          :style="{ '--surface-alpha': opacity }"
          >
        <v-toolbar density="compact" class="bg-blue-grey-lighten-5 pa-2 text-medium-emphasis" :style="{ '--surface-alpha': opacity + 0.2 }">
          <v-toolbar-title>
            <v-icon icon="mdi-information-outline" class="mr-2"></v-icon>
            <span class="text-h6">{{ t('about.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>
        <v-card-text>
          <v-row class="mb-10">
            <v-col cols="3" class="d-flex align-center justify-center">
              <div class="icon-container">
                <v-img
                    class="mx-auto mb-10"
                    height="120"
                    width="120"
                :src="fav"
                style="min-width: 80px"
                >
                <template v-slot:error>
                  <div class="error-wrapper d-flex align-center justify-center h-100">
                    <v-icon
                        icon="mdi-cube-scan"
                        size="40"
                        class="app-logo"
                    />
                  </div>
                </template>
                </v-img>
              </div>
            </v-col>

            <v-col cols="9">
              <v-row>
                <v-col cols="12">
                  <div class="d-flex justify-space-between">
                    <span class="text-h6 text-blue-grey-darken-2 text-medium-emphasis">{{ t('about.version', { version: appData.appVersion }) }}</span>
                  </div>
                  <v-row align="center" justify="start">
                    <v-col cols="auto">
                      <v-btn
                          variant="outlined"
                          prepend-icon="mdi-update"
                          :loading="chuckLoading"
                          @click="checkUpdate(false)"
                      >
                        {{ t('about.actions.checkUpdate') }}
                      </v-btn>
                    </v-col>
                    <v-col cols="auto">
                      <v-btn
                          variant="outlined"
                          prepend-icon="mdi-text-box"
                          @click="openLink('https://github.com/guapi-exe/McSTools/commits/master/')"
                      >
                        {{ t('about.actions.changelog') }}
                      </v-btn>
                    </v-col>
                  </v-row>
                </v-col>
                <v-col cols="12">
                  <p class="text-body-1 text-grey-darken-2 text-medium-emphasis">
                    {{ t('about.description.content') }}
                  </p>
                </v-col>
                <v-col cols="12">
                  <v-row align="center" justify="start">
                    <v-col cols="auto">
                      <v-btn
                          density="default"
                          variant="outlined"
                          prepend-icon="mdi-github"
                          @click="openLink('https://github.com/guapi-exe/McSTools')"
                      >
                        {{ t('about.actions.github') }}
                      </v-btn>
                    </v-col>
                    <v-col cols="auto">
                      <v-btn
                          density="default"
                          variant="outlined"
                          prepend-icon="mdi-web"
                          @click="openLink('https://www.mcschematic.top/home/')"
                      >
                        {{ t('about.actions.website') }}
                      </v-btn>
                    </v-col>
                    <v-col cols="auto">
                      <v-btn
                          density="default"
                          variant="outlined"
                          @click="openLink('https://ifdian.net/a/guapi-exe')"
                      >
                        <v-icon>
                          <v-img :src="ifdian"></v-img>
                        </v-icon>
                        {{ t('about.actions.sponsor') }}
                      </v-btn>
                    </v-col>
                    <v-col cols="auto">
                      <v-btn
                          density="default"
                          variant="outlined"
                          prepend-icon="mdi-comment-question-outline"
                          @click=""
                      >
                        {{ t('about.actions.faq') }}
                      </v-btn>
                    </v-col>
                  </v-row>
                </v-col>
                <v-col cols="12">
                  <v-card>
                    <v-toolbar density="compact" class="pa-2 justify-center">
                      <v-toolbar-title class="d-inline-flex align-center justify-center">
                        <div class="d-flex align-center">
                          <v-img :src="fav" class="mr-2"
                          style="height: 32px; width: 32px; flex-shrink: 0"
                          ></v-img>
                          <span class="text-h6 text-blue-grey-darken-2">{{ t('about.schematicSite.title') }}</span>
                        </div>
                      </v-toolbar-title>
                    </v-toolbar>

                    <v-card-text class="text-center">
                      <p class="text-body-1 text-grey-darken-2 mb-4">
                        {{ t('about.schematicSite.description') }}
                      </p>

                      <div class="d-flex justify-center">
                        <v-btn
                            color="secondary"
                            variant="outlined"
                            prepend-icon="mdi-web"
                            class="px-6"
                        @click="openLink('https://www.mcschematic.top/home/')"
                        >
                        {{ t('about.schematicSite.visit') }}
                        </v-btn>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
                <v-col cols="12">
                  <div class="d-flex align-start">
                    <div class="mr-3 mt-1">
                      <v-icon color="grey" size="42">
                        <v-img :src="tauri"></v-img>
                      </v-icon>
                    </div>

                    <div>
                      <p class="text-body-1 mb-1">
                        <span class="font-weight-medium">{{ t('about.tauri.title') }}</span>
                        <v-tooltip location="top">
                          <template v-slot:activator="{ props }">
                            <v-icon v-bind="props" size="16" class="ml-1 ">mdi-information-outline</v-icon>
                          </template>
                          <span>{{ t('about.tauri.tooltip') }}</span>
                        </v-tooltip>
                      </p>

                      <div class="d-flex align-center flex-wrap">
                        <span class="text-caption text-grey-darken-1 mr-2">
                          {{ t('about.tauri.currentVersion', { version: appData.tauriVersion }) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </v-col>
                <v-col cols="12">
                  <div class="d-flex align-start">
                    <div class="mr-3 mt-1">
                      <v-icon color="grey" size="42">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M2 21v-2h9V7.825q-.65-.225-1.125-.7T9.175 6H6l3 7q0 1.25-1.025 2.125T5.5 16t-2.475-.875T2 13l3-7H3V4h6.175q.3-.875 1.075-1.437T12 2t1.75.563T14.825 4H21v2h-2l3 7q0 1.25-1.025 2.125T18.5 16t-2.475-.875T15 13l3-7h-3.175q-.225.65-.7 1.125t-1.125.7V19h9v2zm14.625-8h3.75L18.5 8.65zm-13 0h3.75L5.5 8.65zM12 6q.425 0 .713-.288T13 5t-.288-.712T12 4t-.712.288T11 5t.288.713T12 6"/>
                        </svg>
                      </v-icon>
                    </div>

                    <div>
                      <p class="text-body-1 mb-1">
                        <span class="font-weight-medium">{{ t('about.license.title') }}</span>
                        <v-tooltip location="top">
                          <template v-slot:activator="{ props }">
                            <v-icon v-bind="props" size="16" class="ml-1 ">
                              mdi-information-outline
                            </v-icon>
                          </template>
                          <span>{{ t('about.license.tooltip') }}</span>
                        </v-tooltip>
                      </p>
                      <div class="d-flex align-center flex-wrap">
                        <span class="text-caption text-grey-darken-1 mr-2">
                          {{ t('about.license.copyright') }}
                        </span>
                        <v-btn
                            variant="text"
                            color="secondary"
                            density="compact"
                            class="px-1"
                            @click="openLink('https://www.gnu.org/licenses/agpl-3.0.en.html')"
                        >
                          <span class="text-caption">{{ t('about.license.viewLicense') }}</span>
                          <v-icon icon="mdi-open-in-new" size="14" class="ml-1"></v-icon>
                        </v-btn>
                      </div>
                    </div>
                  </div>
                </v-col>
                <v-col cols="12">
                  <div class="d-flex align-start">
                    <div class="mr-3 mt-1">
                      <v-icon color="info" size="32">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="#0284c7" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81c1.66 0 3-1.34 3-3s-1.34-3-3-3s-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.15c-.05.21-.08.43-.08.66c0 1.61 1.31 2.91 2.92 2.91s2.92-1.3 2.92-2.91s-1.31-2.92-2.92-2.92M18 4c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1M6 13c-.55 0-1-.45-1-1s.45-1 1-1s1 .45 1 1s-.45 1-1 1m12 7c-.55 0-1-.45-1-1s.45-1 1-1s1 .45 1 1s-.45 1-1 1"/></svg>
                      </v-icon>
                    </div>
                    <div>
                      <p class="text-body-1 mb-1">
                        <span class="font-weight-medium">{{ t('about.developers.title') }}</span>
                        <v-tooltip location="top">
                          <template v-slot:activator="{ props }">
                            <v-icon v-bind="props" size="16" color="grey" class="ml-1">mdi-information-outline</v-icon>
                          </template>
                          <span>{{ t('about.developers.tooltip') }}</span>
                        </v-tooltip>
                      </p>
                      <v-row>
                        <v-col cols="auto">
                          <v-tooltip location="top">
                            <template v-slot:activator="{ props }">
                              <div class="d-flex align-start" v-bind="props">
                                <v-avatar size="28" class="mr-2">
                                  <v-img alt="author" :src="guapi"></v-img>
                                </v-avatar>
                                <span class="text-h6 font-weight-medium">Guapi</span>
                              </div>
                            </template>
                            <span>{{ t('about.developers.author') }}</span>
                          </v-tooltip>
                        </v-col>
                      </v-row>
                    </div>
                  </div>
                </v-col>
              </v-row>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

</template>

<style scoped>

.icon-container {
  position: relative;
  width: 160px;
  height: 160px;
  min-height: 100px;
}

.error-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
}

</style>