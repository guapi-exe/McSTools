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
          发现新版本 {{ updateInfo?.version }}
        </v-card-title>

        <v-card-text>
          <div v-if="updateState === UpdateState.Pending">
            <p>发布日期: {{ updateInfo?.date }}</p>
            <pre>{{ updateInfo?.body }}</pre>
          </div>

          <div v-else-if="updateState === UpdateState.Downloading">
            <v-progress-linear
                :value="updateProgress"
                color="info"
                height="25"
                striped
            >
              <strong>{{ updateProgress }}</strong>
            </v-progress-linear>
            <div class="text-caption mt-2">
              已下载: {{ (updateProgress/ 1024 / 1024).toFixed(2)  }}MB
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
          更新准备就绪
        </v-card-title>

        <v-card-text>
          新版本已下载完成，是否立即重启应用生效？
        </v-card-text>

        <v-card-actions>
          <v-btn
              color="info"
              @click="relaunch()"
          >
            立即重启
          </v-btn>
          <v-spacer />
          <v-btn
              text
              @click="restartDialog = false"
          >
            稍后重启
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
  updateDialog,
  updateInfo,
  updateProgress,
  updateState,
  UpdateState
} from "./modules/chuck_update.ts";
import {resources_Init} from "./modules/threed_data/deepslateInit.ts";
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
const { locale } = useI18n()

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
    resources_Init(),
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
</style>
<style lang="css" src="./assets/css/app.css"></style>
<style lang="scss" src="./assets/css/main.scss"></style>
<style lang="css" src="./assets/css/card.css"></style>
<style lang="css" src="./assets/css/views.css"></style>
<style lang="css" src="./assets/css/loading.css"></style>
<style lang="css" src="./assets/css/fonts.css"></style>