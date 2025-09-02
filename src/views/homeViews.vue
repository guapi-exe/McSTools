<script setup lang="ts">
import bgImg from '../static/img/bg.jpg'
import createImg from '../static/img/create.jpg'
import lmImg from '../static/img/Litematica.jpg'
import weImg from '../static/img/wordEdit.png'
import beImg from '../static/img/grass_block.png'
import {onBeforeUnmount, onMounted, ref} from "vue";
import {opacity} from "../modules/theme.ts";
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
import {isLeaving, navigationGuard} from "../modules/navigation.ts";
import {createTimeManager} from '../modules/time_data.ts'
import {messageList} from "../modules/messages.ts";
import { useI18n } from 'vue-i18n';

const { t } = useI18n()
const timeManager = createTimeManager()
const {
  currentDate,
  hours,
  minutes,
  seconds,
  isNewSecond,
} = timeManager.useInComponent()
const currentIndex = ref(0)
const displayText = ref('')
const isDragging = ref(false);
const isAnimating = ref(false)
let intervalId: number | null = null
let timeoutId: number | null = null
const randomHanChar = () => {
  const symbols = '~!@#$%^&*()_+?？；;，。.、你更下二一三四我'
  return Math.random() > 0.3
      ? symbols[Math.floor(Math.random() * symbols.length)]
      : String.fromCharCode(0x4e00 + Math.floor(Math.random() * 20902))
}
const generateNoise = (length: number) => {
  return Array.from({ length }, () => randomHanChar()).join('')
}
const revealText = (target: string) => {
  let index = 0
  const targetArr = target.split('')
  const noiseArr = generateNoise(target.length).split('')

  intervalId = setInterval(() => {
    if (index >= target.length) {
      clearInterval(intervalId!)
      intervalId = null
      isAnimating.value = false
      return
    }

    noiseArr[index] = targetArr[index]
    displayText.value = noiseArr.join('')
    index++
  }, 50)
}
const switchMessage = () => {
  isAnimating.value = true
  const target = messageList.value[currentIndex.value]

  displayText.value = generateNoise(target.length)

  timeoutId = setTimeout(() => {
    revealText(target)
    timeoutId = null
  }, 300)
}
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
onMounted(() => {
  setInterval(() => {
    currentIndex.value = (currentIndex.value + 1) % messageList.value.length
    switchMessage()
  }, 10000)

  switchMessage()
})

onBeforeUnmount(() => {
    if (progressTimer.value) {
      window.clearInterval(progressTimer.value)
    }
  if (intervalId) clearInterval(intervalId)
  if (timeoutId) clearTimeout(timeoutId)
})
onBeforeRouteLeave(navigationGuard)
</script>

<template class="page-wrapper">
  <v-row no-gutters class="mb-4 animate-row"
         :class="{ 'animate-row-out': isLeaving }"
         transition="scroll-x-transition"
  >
    <v-col>
      <v-card
          class="mx-auto v-theme--custom text-primary"
          :style="{ '--surface-alpha': opacity }"
          elevation="4"
          transition="slide-x-transition"
      >
        <v-toolbar density="compact" class="bg-blue-grey-lighten-5 pa-3" :style="{ '--surface-alpha': opacity + 0.2 }">
          <v-toolbar-title>
            <v-icon icon="mdi-tools" class="mr-2 text-medium-emphasis"></v-icon>
            <span class="text-h5 text-medium-emphasis">{{ t('home.title') }}</span>
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
                  <div class="text-h4 text-grey-darken-3 text-medium-emphasis">{{ userData?.cloud ?? 0 }}</div>
                </div>
              </div>
            </v-col>
            <v-col cols="3">

            </v-col>
            <v-col cols="5">
              <v-row class="mb-4 justify-md-end" dense>
                <v-col cols="6" md="4">
                  <div class="d-flex align-start">
                    <v-avatar size="56" class="mr-3">
                      <v-img
                          :src="userData?.avatar || '/default-avatar.png'"
                          aspect-ratio="1"
                      >
                        <template v-slot:placeholder>
                          <v-progress-circular indeterminate />
                        </template>
                        <template v-slot:error>
                          <v-icon size="45">
                            mdi-account-circle
                          </v-icon>
                        </template>
                      </v-img>
                    </v-avatar>
                    <div>
                      <div class="text-caption text-grey-darken-1 text-medium-emphasis mb-1">
                        <v-icon small left>mdi-login</v-icon>
                        {{ t('home.stats.welcome') }}
                      </div>
                      <div class="text-h6 font-weight-medium text-blue-darken-4">
                        {{ userData?.nickname || '用户' }}
                      </div>
                    </div>
                  </div>
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
          <v-alert
              variant="tonal"
              color="blue"
              icon="mdi-information-outline"
              class="mt-4 monospace-font"
          >
            {{ displayText }}
          </v-alert>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
  <v-row
      class="animate-row"
      :class="{ 'animate-row-out': isLeaving }"
      style="height: 500px"
  >
    <v-col cols="8" class="h-100">
      <v-card class="
      d-flex
      v-theme--custom text-primary
      flex-column
      h-100"
              elevation="4"
              :style="{ '--surface-alpha': opacity }"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
              @drop.prevent="onDrop"

      >
        <v-card-title class="text-h6 bg-blue-lighten-5">
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
                accept=".nbt, .json, .schem, .litematic"
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
              :style="{ '--surface-alpha': opacity }"
              elevation="4">
        <v-card-title class="text-h6 bg-green-lighten-5">
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

</template>

<style scoped lang="css" src="../assets/css/home.css"></style>
