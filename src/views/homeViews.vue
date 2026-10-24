<script setup lang="ts">
import bgImg from '../static/img/bg.jpg'
import createImg from '../static/img/create.jpg'
import lmImg from '../static/img/Litematica.jpg'
import weImg from '../static/img/wordEdit.png'
import beImg from '../static/img/grass_block.png'
import {onActivated, onBeforeUnmount, onDeactivated, onMounted, ref} from "vue";
import {onBeforeRouteLeave} from 'vue-router'
import {
  files,
  handleUpload,
  progressTimer,
  progressValue,
  uploadError,
  uploadStatus
} from "../modules/upload_schematic.ts";
import {userData} from "../modules/user_data.ts";
import {mcsConnected, mcsSaved, mcsStatus, mcsStatusLabel, mcsBlueprintCount, mcsConnectionDialog} from '../modules/web_schematic/mcs_api';
import {useRouter} from 'vue-router';
import {navigationGuard} from "../modules/navigation.ts";
import {createTimeManager} from '../modules/time_data.ts'
import { useI18n } from 'vue-i18n';

const { t } = useI18n()
const router = useRouter()
const openSiteLibrary = (collection = 'public') => router.push({name: 'schematic', query: {source: 'web', collection}})
const timeManager = createTimeManager(false)
const timeComponent = timeManager.useInComponent()
const {
  currentDate,
  hours,
  minutes,
  seconds,
  isNewSecond,
} = timeComponent
timeComponent.setup()
const isDragging = ref(false);
const onDragOver = async (e: any) => {
  e.preventDefault();
  isDragging.value = true;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
}

const onDragLeave = async (e: any) => {
  e.preventDefault();
  isDragging.value = false;
}

const onDrop = async (e: any) => {
  e.preventDefault();
  isDragging.value = false;
  const files_load = e.dataTransfer.files;
  if (files_load.length === 0) return;
  files.value = Array.from(files_load);
  console.log(files);
  await handleUpload(-1);
}
// Pause the cached home page's clock while another page is active.
onMounted(() => {
  timeManager.start()
})

onActivated(() => {
  timeManager.start()
})

onDeactivated(() => {
  timeManager.stop()
})

onBeforeUnmount(() => {
  if (progressTimer.value) {
    window.clearInterval(progressTimer.value)
  }
})
onBeforeRouteLeave(navigationGuard)
</script>

<template>
  <div class="page-view">
  <v-row no-gutters class="mb-4 animate-row"
  >
    <v-col>
      <v-card
          class="mx-auto v-theme--custom text-primary"
          elevation="2"
      >
        <v-toolbar density="compact" class="bg-surface-container pa-3">
          <v-toolbar-title>
            <v-icon icon="mdi-tools" class="mr-2 text-medium-emphasis"></v-icon>
            <span class="text-h6 text-medium-emphasis">{{ t('home.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>

        <v-card-text class="py-4">
          <v-row class="mb-4" dense>
            <v-col cols="2">
              <div class="d-flex align-center">
                <v-icon icon="mdi-folder-multiple" color="deep-purple" class="mr-2"></v-icon>
                <div>
                  <div class="text-caption text-grey text-medium-emphasis">{{ t('home.stats.localSchematics') }}</div>
                  <div class="text-h4 text-grey-darken-3 text-medium-emphasis">{{ userData?.schematics ?? 0 }}</div>
                </div>
              </div>
            </v-col>

            <v-col cols="2">
              <div class="d-flex align-center">
                <v-icon icon="mdi-cloud-upload" size="28" color="teal" class="mr-2"></v-icon>
                <div>
                  <div class="text-caption text-grey text-medium-emphasis">{{ t('home.stats.cloudSchematics') }}</div>
                  <div class="text-h4 text-grey-darken-3 text-medium-emphasis">{{ mcsBlueprintCount ?? '—' }}</div>
                </div>
              </div>
            </v-col>
            <v-col cols="3">

            </v-col>
            <v-col cols="5">
              <v-row class="mb-4 justify-md-end" dense>
                <v-col cols="6" md="4">
                  <button class="d-flex align-start text-left" aria-label="蓝图站账户与连接" @click="mcsConnectionDialog = true">
                    <v-avatar size="56" class="mr-3">
                      <v-icon size="45" :color="mcsConnected ? 'info' : undefined" icon="mdi-account-circle-outline" />
                    </v-avatar>
                    <div>
                      <div class="text-caption text-grey-darken-1 text-medium-emphasis mb-1">
                        <v-icon small left>mdi-login</v-icon>
                        {{ mcsConnected ? t('home.stats.welcome') : '连接蓝图站' }}
                      </div>
                      <div class="text-h6 font-weight-medium text-info">
                        {{ mcsSaved ? '站点账户' : '离线使用' }}
                      </div>
                    </div>
                  </button>
                </v-col>

                <v-col cols="6" md="4">
                  <div class="d-flex align-center justify-end">
                    <v-icon
                        color="teal"
                        size="26"
                        class="mr-2 animate-icon"
                        :class="{ 'icon-pulse': isNewSecond }"
                    >
                      mdi-clock-outline
                    </v-icon>
                    <div class="text-right">
                      <div class="text-h5 font-weight-bold text-teal-darken-2 time-digits">
                        <transition name="digit" mode="out-in">
                          <span :key="hours" class="time-part">{{ hours }}</span>
                        </transition>
                        <span class="time-colon">:</span>

                        <transition name="digit" mode="out-in">
                          <span :key="minutes" class="time-part">{{ minutes }}</span>
                        </transition>
                        <span class="time-colon">:</span>

                        <transition name="digit" mode="out-in">
                          <span :key="seconds" class="time-part">{{ seconds }}</span>
                        </transition>

                        <span class="text-body-2 ml-1">24H</span>
                      </div>

                      <transition name="fade-slide">
                        <div
                            :key="currentDate"
                            class="text-caption text-grey-darken-1 date-display"
                        >
                          <v-icon x-small>mdi-calendar</v-icon>
                          {{ currentDate }}
                        </div>
                      </transition>
                    </div>
                  </div>
                </v-col>
              </v-row>
            </v-col>
          </v-row>
          <div class="site-connection-strip">
            <v-icon :icon="mcsStatus === 'connected' ? 'mdi-cloud-check-outline' : 'mdi-cloud-outline'" color="info" size="30" />
            <div class="flex-grow-1">
              <div class="font-weight-medium">MCS 蓝图站 <span class="text-caption text-medium-emphasis ml-2">{{ mcsStatusLabel }}</span></div>
            </div>
            <v-btn variant="text" size="small" @click="openSiteLibrary()">浏览蓝图站</v-btn>
            <v-btn v-if="mcsConnected" variant="tonal" color="info" size="small" @click="openSiteLibrary('mine')">我的蓝图</v-btn>
            <v-btn v-if="mcsConnected" variant="text" size="small" @click="openSiteLibrary('favourites')">我的收藏</v-btn>
            <v-btn variant="tonal" color="info" size="small" @click="mcsConnectionDialog = true">{{ mcsSaved ? '管理连接' : '连接账户' }}</v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
  <v-row
      class="animate-row"
      style="height: 500px"
  >
    <v-col cols="8" class="h-100">
      <v-card class="
      d-flex
      v-theme--custom text-primary
      flex-column
      h-100"
              elevation="2"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
              @drop.prevent="onDrop"

      >
        <v-card-title class="text-h6 bg-surface-container">
          <v-icon icon="mdi-cloud-upload" class="mr-2"></v-icon>
          {{ t('home.upload.title') }}
        </v-card-title>

        <v-card-text class="upload-area pa-8" :class="{ 'drag-active': isDragging }">
          <div class="text-center mb-4">
            <v-icon
                icon="mdi-cloud-upload"
                size="80"
                class="mb-2 text-medium-emphasis"
            ></v-icon>
            <div class="text-h6 text-medium-emphasis">{{ t('home.upload.dragDrop') }}</div>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ t('home.upload.supportedFormats') }}
            </div>
          </div>

          <div class="upload-container">
            <v-file-input
                :aria-disabled="isDragging"
                v-model="files"
                class="custom-file-input"
                variant="solo-filled"
                color="info"
                bg-color="grey-lighten-3"
                :label="t('home.upload.selectFile')"
                multiple
                accept=".nbt, .json, .schem, .schematic, .litematic, .mcstructure"
                :max-file-size="100 * 1024 * 1024"
                :loading="uploadStatus === 'uploading'"
                :error-messages="uploadError"
                :disabled="uploadStatus === 'uploading'"
                @update:model-value="handleUpload(-1)"
            >
            </v-file-input>

            <v-alert
                v-if="uploadStatus === 'success'"
                type="success"
                variant="tonal"
                class="mt-2"
            >
              <template #prepend>
                <v-icon icon="mdi-check-circle" class="mr-2"></v-icon>
              </template>

              <div class="d-flex align-center">
                <span class="mr-2">{{ t('home.upload.uploadSuccess', { count: files.length }) }}</span>
                <v-spacer></v-spacer>
                <v-btn
                    icon
                    variant="text"
                    size="x-small"
                    @click="uploadStatus = 'idle'"
                >
                  <v-icon>mdi-close</v-icon>
                </v-btn>
              </div>

              <v-progress-linear
                  :model-value="progressValue"
                  color="success"
                  height="8"
                  class="mt-2"
                  stream
                  rounded
              >
                <template #default>
                  <span class="text-caption">{{ Math.ceil(progressValue) }}%</span>
                </template>
              </v-progress-linear>
            </v-alert>

            <v-alert
                v-if="uploadStatus === 'error'"
                type="error"
                variant="tonal"
                class="mt-2"
            >
              <template #prepend>
                <v-icon icon="mdi-check-circle" class="mr-2"></v-icon>
              </template>

              <div class="d-flex align-center">
                <span class="mr-2">{{ t('home.upload.uploadError', { error: uploadError }) }}</span>
                <v-spacer></v-spacer>
                <v-btn
                    icon
                    variant="text"
                    size="x-small"
                    @click="uploadStatus = 'idle'"
                >
                  <v-icon>mdi-close</v-icon>
                </v-btn>
              </div>

              <v-progress-linear
                  :model-value="progressValue"
                  color="error"
                  height="8"
                  class="mt-2"
                  stream
                  rounded
              >
                <template #default>
                  <span class="text-caption">{{ Math.ceil(progressValue) }}%</span>
                </template>
              </v-progress-linear>
            </v-alert>
          </div>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="4" class="h-100">
      <v-card class="
      h-100
      v-theme--custom text-primary "
              elevation="2">
        <v-card-title class="text-h6 bg-surface-container">
          <v-icon icon="mdi-format-list-checks" class="mr-2"></v-icon>
          {{ t('home.supportedTypes.title') }}
        </v-card-title>

        <v-card-text>
          <v-list lines="two">
            <v-list-item
            >
              <template v-slot:prepend>
                <v-avatar>
                  <v-img
                      :src="createImg"
                      sizes="40"
                  ></v-img>
                </v-avatar>
              </template>
              <template v-slot:title>
                <span class="font-weight-bold">{{ t('home.supportedTypes.vanilla.title') }}</span>
              </template>
              <template v-slot:subtitle>
                {{ t('home.supportedTypes.vanilla.desc') }}
              </template>
            </v-list-item>
            <v-list-item
            >
              <template v-slot:prepend>
                <v-avatar>
                  <v-img
                      :src="bgImg"
                      sizes="40"
                  ></v-img>
                </v-avatar>
              </template>
              <template v-slot:title>
                <span class="font-weight-bold">{{ t('home.supportedTypes.buildingGadgets.title') }}</span>
              </template>
              <template v-slot:subtitle>
                {{ t('home.supportedTypes.buildingGadgets.desc') }}
              </template>
            </v-list-item>
            <v-list-item
            >
              <template v-slot:prepend>
                <v-avatar>
                  <v-img
                      :src="lmImg"
                      sizes="40"
                  ></v-img>
                </v-avatar>
              </template>
              <template v-slot:title>
                <span class="font-weight-bold">{{ t('home.supportedTypes.litematica.title') }}</span>
              </template>
              <template v-slot:subtitle>
                {{ t('home.supportedTypes.litematica.desc') }}
              </template>
            </v-list-item>
            <v-list-item
            >
              <template v-slot:prepend>
                <v-avatar>
                  <v-img
                      :src="weImg"
                      sizes="40"
                  ></v-img>
                </v-avatar>
              </template>
              <template v-slot:title>
                <span class="font-weight-bold">{{ t('home.supportedTypes.worldEdit.title') }}</span>
              </template>
              <template v-slot:subtitle>
                {{ t('home.supportedTypes.worldEdit.desc') }}
              </template>
            </v-list-item>
            <v-list-item
            >
              <template v-slot:prepend>
                <v-avatar>
                  <v-img
                      :src="beImg"
                      sizes="40"
                  ></v-img>
                </v-avatar>
              </template>
              <template v-slot:title>
                <span class="font-weight-bold">{{ t('home.supportedTypes.bedrock.title') }}</span>
              </template>
              <template v-slot:subtitle>
                {{ t('home.supportedTypes.bedrock.desc') }}
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
  </div>
</template>

<style scoped lang="css" src="../assets/css/home.css"></style>
