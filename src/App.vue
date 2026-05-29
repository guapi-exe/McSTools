<template >
  <v-app :style="backgroundStyle" id="custom-font-style">
    <v-theme-provider>
      <div class="layout-container">
        <app-layout class="app-layout" />
        <v-main>
          <div class="scroll-container">
            <router-view v-slot="{ Component }">
              <transition name="page" mode="out-in">
                <div class="page-wrapper">
                  <component :is="Component" />
                </div>
              </transition>
            </router-view>
          </div>
        </v-main>
      </div>
    </v-theme-provider>
    <v-dialog v-model="updateDialog" max-width="500">
      <v-card
          class="v-theme--custom"
          :style="{ '--surface-alpha': opacity }"
      >
        <v-card-title class="headline">
          <v-icon class="mr-2">mdi-update</v-icon>
          {{ $t('updater.dialog.title', { version: updateInfo?.version ?? '-' }) }}
        </v-card-title>

        <v-card-text>
          <div v-if="updateState === UpdateState.Pending">
            <p>{{ $t('updater.dialog.releaseDate', { date: updateInfo?.date ?? '-' }) }}</p>
            <pre>{{ updateInfo?.body }}</pre>
          </div>

          <div v-else-if="updateState === UpdateState.Downloading">
            <v-progress-linear
                :model-value="updateProgress"
                :indeterminate="updateTotalBytes === null"
                color="info"
                height="25"
                striped
            >
              <strong>{{ updateTotalBytes === null ? $t('updater.dialog.downloading') : `${updateProgress}%` }}</strong>
            </v-progress-linear>
            <div class="text-body-2 mt-3">
              {{ updateStatusText }}
            </div>
            <div class="text-caption mt-2">
              {{ $t('updater.dialog.downloaded') }}: {{ formatBytes(updateDownloadedBytes) }}
              <span v-if="updateTotalBytes !== null"> / {{ formatBytes(updateTotalBytes) }}</span>
            </div>
            <div class="text-caption mt-1">
              {{ $t('updater.dialog.speed') }}: {{ formatSpeed(updateDownloadSpeed) }}
            </div>
            <div class="text-caption mt-1">
              {{ $t('updater.dialog.eta') }}: {{ formatRemainingTime(updateRemainingSeconds, updateTotalBytes) }}
            </div>
          </div>

          <div v-else-if="updateState === UpdateState.Installing" class="installing-state">
            <v-progress-circular
                indeterminate
                color="info"
                size="48"
                width="5"
            />
            <div class="text-body-1 mt-4 font-weight-medium">
              {{ updateStatusText }}
            </div>
            <div class="text-caption mt-2 text-medium-emphasis">
              {{ $t('updater.dialog.installingHint') }}
              <span class="installing-dots" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
            </div>
          </div>
        </v-card-text>

        <v-card-actions>
          <v-btn
              v-if="updateState === UpdateState.Pending"
              color="info"
              @click="confirmUpdate"
          >
            立即更新
          </v-btn>
          <v-btn
              text
              :disabled="updateState === UpdateState.Installing"
              @click="updateDialog = false"
          >
            {{ updateState === UpdateState.Pending ? '稍后提醒' : '后台下载' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="restartDialog" max-width="400">
      <v-card>
        <v-card-title class="headline">
          <v-icon color="success" class="mr-2">mdi-check-circle</v-icon>
          {{ $t('updater.restart.title') }}
        </v-card-title>

        <v-card-text>
          <div>{{ $t('updater.restart.installedComplete') }}</div>
          <div class="text-caption mt-2 text-medium-emphasis">
            {{ $t('updater.restart.autoRestart', { seconds: restartCountdownSeconds }) }}
          </div>
        </v-card-text>

        <v-card-actions>
          <v-btn
              color="info"
              @click="relaunch()"
          >
            {{ $t('updater.restart.restartNow') }}
          </v-btn>
          <v-spacer />
          <v-btn
              text
              @click="restartDialog = false"
          >
            {{ $t('updater.restart.restartLater') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-fab-transition>
      <v-fab
          v-show="showBackToTop"
          color="info"
          :absolute="true"
          icon="mdi-up"
          size="large"
          location="right bottom"
          class="back-to-top"
          @click="scrollToTop"
      />
    </v-fab-transition>
    <v-fab v-if="change_data"
           icon="mdi-content-save-all-outline"
           location="right bottom"
           size="large"
           :app="true"
           color="info"
           @click="showSaveDialog = true"
    ></v-fab>
  </v-app>
</template>

<script setup lang="ts">
import AppLayout from "./layout/AppLayout.vue";
import {nextTick, onMounted, onUnmounted, ref, watchEffect} from "vue";
import {appStore} from "./modules/store.ts";
import {useTheme} from "vuetify/framework";
import {useI18n} from 'vue-i18n'
import {backgroundOpacity, backgroundUrl, initTheme, layoutMode, opacity} from "./modules/theme.ts";
import {invoke} from "@tauri-apps/api/core";
import {fetchJeBlocks, jeBlocks} from "./modules/je_blocks.ts";
import {fetchUserData} from "./modules/user_data.ts";
import {relaunch} from "@tauri-apps/plugin-process";
import {appData, getAppVersion} from "./modules/app_data.ts";
import {fetchMapArtsData, mapArtData} from "./modules/map_art/map_art_data.ts";
import {
  checkUpdate,
  confirmUpdate,
  restartDialog,
  restartCountdownSeconds,
  updateDialog,
  updateDownloadedBytes,
  updateDownloadSpeed,
  updateInfo,
  updateProgress,
  updateRemainingSeconds,
  updateStatusText,
  updateState,
  updateTotalBytes,
  UpdateState
} from "./modules/chuck_update.ts";
import {loadThreeDBlocksResources} from "./modules/3DBLOCKS";
import {detectTheme, toast} from "./modules/others.ts";
import {change_data, showSaveDialog} from "./modules/snbt_to_json.ts";

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
}

const theme = useTheme()
const selectedTheme = ref('grey')
const autoUpdateEnabled = ref(true);
const backgroundStyle = ref({
  backgroundColor: '',
  backgroundImage: '',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
  '--gradient-opacity': `${1 - backgroundOpacity.value}`,
  transform: 'translateZ(0)',
})

const showBackToTop = ref(false)
const { locale, t: $t } = useI18n()

const formatBytes = (bytes: number | null) => {
  if (bytes === null || Number.isNaN(bytes)) {
    return $t('updater.units.unknown')
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`
}

const formatSpeed = (bytesPerSecond: number) => {
  if (!bytesPerSecond || bytesPerSecond <= 0) {
    return $t('updater.dialog.calculating')
  }

  return `${formatBytes(bytesPerSecond)}/s`
}

const formatRemainingTime = (seconds: number | null, totalBytes: number | null) => {
  if (totalBytes === null) {
    return $t('updater.dialog.unknownTotal')
  }

  if (seconds === null) {
    return $t('updater.dialog.calculating')
  }

  if (seconds <= 0) {
    return $t('updater.dialog.almostDone')
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return $t('updater.time.hoursMinutesSeconds', { hours, minutes, seconds: secs })
  }

  if (minutes > 0) {
    return $t('updater.time.minutesSeconds', { minutes, seconds: secs })
  }

  return $t('updater.time.seconds', { seconds: secs })
}

const checkScroll = () => {
  const mainContent = document.getElementById('app') as HTMLElement
  const scrollY = mainContent?.scrollTop || 0
  showBackToTop.value = scrollY > 300
}

const runWhenBrowserIdle = (task: () => void | Promise<void>, timeout = 1200) => {
  const idleWindow = window as IdleCapableWindow

  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(() => {
      void task()
    }, { timeout })
    return
  }

  window.setTimeout(() => {
    void task()
  }, 32)
}

const preloadNonCriticalResources = async () => {
  const [appVersionResult, jeBlocksResult, mapArtResult, resourcesResult, updateResult] = await Promise.allSettled([
    getAppVersion(),
    fetchJeBlocks(),
    fetchMapArtsData(),
    loadThreeDBlocksResources(),
    autoUpdateEnabled.value ? checkUpdate(true) : Promise.resolve(null),
  ])

  if (appVersionResult.status === 'fulfilled') {
    appData.value = appVersionResult.value
  }

  if (jeBlocksResult.status === 'fulfilled') {
    jeBlocks.value = jeBlocksResult.value
  }

  if (mapArtResult.status === 'fulfilled') {
    mapArtData.value = mapArtResult.value
  }

  if (resourcesResult.status === 'rejected') {
    toast.error(`资源加载失败:${resourcesResult.reason}`, {timeout: 3000})
  }

  if (updateResult.status === 'rejected') {
    console.error('检查更新失败:', updateResult.reason)
  }
}

const scrollToTop = () => {
  const mainContent = document.getElementById('app') as HTMLElement
  if (!mainContent) return

  const startPosition = mainContent.scrollTop
  const startTime = performance.now()

  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / 600, 1)
    const ease = 1 - Math.pow(1 - progress, 4)

    mainContent.scrollTop = startPosition * (1 - ease)

    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }

  requestAnimationFrame(animate)
}
onUnmounted(() => {
  const mainContent = document.getElementById('app')
  if (mainContent) {
    mainContent.removeEventListener('scroll', checkScroll)
  }
})


watchEffect(() => {
  if (backgroundUrl.value) {
    backgroundStyle.value.backgroundImage = `
      linear-gradient(
        rgba(var(--v-theme-background), var(--gradient-opacity)),
        rgba(var(--v-theme-background), var(--gradient-opacity))
      ),
      url(${backgroundUrl.value})
    `;
    backgroundStyle.value.backgroundSize = layoutMode.value;
    backgroundStyle.value["--gradient-opacity"] = (1 - backgroundOpacity.value).toString()
  } else {
    backgroundStyle.value.backgroundImage = '';
  }
})

onMounted(async () => {
  await nextTick(() => {
    const mainContent = document.getElementById('app')
    if (mainContent) {
      mainContent.addEventListener('scroll', checkScroll)
    }
  })
  const [storedLocaleValue, storedThemeValue, storedAutoUpdate] = await Promise.all([
    appStore.get('locale', 'zh-CN'),
    appStore.get('selectedTheme', 'grey'),
    appStore.get('autoUpdate', true),
  ])

  let storedLocale = storedLocaleValue
  if (storedLocale === 'zh') storedLocale = 'zh-CN'
  if (storedLocale === 'zh_tw') storedLocale = 'zh-TW'
  locale.value = storedLocale
  selectedTheme.value = storedThemeValue
  autoUpdateEnabled.value = storedAutoUpdate
  theme.global.name.value = selectedTheme.value
  await Promise.all([
    initTheme(),
    fetchUserData(),
  ])
  await detectTheme(theme);
  await invoke("close_splashscreen")

  runWhenBrowserIdle(preloadNonCriticalResources)
})

</script>

<style lang="scss">
::-webkit-scrollbar {
  width: 0 !important;
}
::-webkit-scrollbar {
  width: 0 !important;height: 0;
}

.installing-state {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.installing-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
}

.installing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.3;
  animation: installing-dot-pulse 1.2s infinite ease-in-out;
}

.installing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.installing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes installing-dot-pulse {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.3;
  }

  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
<style lang="css" src="./assets/css/app.css"></style>
<style lang="scss" src="./assets/css/main.scss"></style>
<style lang="css" src="./assets/css/card.css"></style>
<style lang="css" src="./assets/css/views.css"></style>
<style lang="css" src="./assets/css/loading.css"></style>
<style lang="css" src="./assets/css/fonts.css"></style>
