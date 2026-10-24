<template>
  <v-navigation-drawer
      class="bg-primary fixed-sidebar"
      width="72"
      permanent
      fixed
      :floating="false"
      :elevation="3"
      app
  >
    <div class="logo-container">
      <v-icon
          icon="mdi-cube-scan"
          size="40"
          class="app-logo"
      />
    </div>

    <v-list ref="navList" density="compact" class="nav-list" style="background: none !important;">
      <!-- Single sliding indicator (PCL2 style): one element animates between
           items instead of each item toggling its own bar. -->
      <div
          class="nav-indicator"
          :style="{ transform: `translateY(${indicatorOffset}px)`, opacity: indicatorVisible ? 1 : 0 }"
      ></div>
      <v-tooltip
          v-for="item in navItems"
          :key="item.value"
          location="right"
          :open-delay="100"
          :transition="false"
      >
        <template v-slot:activator="{ props }">
          <v-list-item
              v-bind="props"
              :value="item.value"
              :aria-label="item.title"
              :aria-current="activeTab === item.value ? 'page' : undefined"
              :class="{ 'active-item': activeTab === item.value }"
              class="nav-item"
              @pointerenter="preloadNavigation(item.value)"
              @focus="preloadNavigation(item.value)"
              @click="navigate(item.value)"
          >
            <div class="icon-wrapper ">
              <v-icon :icon="item.icon" size="28"/>
            </div>
          </v-list-item>
        </template>
        <span class="tooltip-text">{{ item.title }}</span>
      </v-tooltip>
    </v-list>
    <template v-slot:append>
      <div class="bottom-actions">
        <v-tooltip location="right" :text="mcsStatusLabel">
          <template #activator="{props}">
            <v-btn v-bind="props" variant="text" icon="mdi-account-circle-outline" :aria-label="mcsStatusLabel" class="account-btn" @click="mcsConnectionDialog = true">
              <v-badge :color="mcsStatus === 'connected' ? 'success' : mcsSaved ? 'warning' : 'grey'" dot floating><v-icon icon="mdi-account-circle-outline" /></v-badge>
            </v-btn>
          </template>
        </v-tooltip>
        <v-tooltip location="right" :transition="false">
          <template v-slot:activator="{ props }">
            <div class="d-flex justify-center">
              <v-btn
                  v-bind="props"
                  icon="mdi-cog-outline"
                  variant="text"
                  class="more-btn"
                  @click="navigate('setting')"
              />
            </div>
          </template>
          <span>{{ $t('menu.settings') }}</span>
        </v-tooltip>
      </div>
    </template>
  </v-navigation-drawer>

</template>

<script setup lang="ts">
import {computed, onMounted, onBeforeUnmount, ref, watch} from "vue";
import {activeTab, navItems} from '../modules/layout.ts'
import {useRouter} from "vue-router";
import {preloadRoute} from "../../router/index.js";
import {mcsConnectionDialog, mcsSaved, mcsStatus, mcsStatusLabel} from '../modules/web_schematic/mcs_api';

const router = useRouter()
watch(() => router.currentRoute.value.name, name => { if (name) activeTab.value = String(name) }, {immediate: true})
let navigationFrame: number | null = null
const preloadedRoutes = new Set<string>()

// Measure the active item's center, including theme/density differences.
// Hidden when the active route is not in the list (e.g. settings).
const navList = ref<{ $el: HTMLElement }>()
const indicatorOffset = ref(0)
const navIndex = computed(() => navItems.findIndex(item => item.value === activeTab.value))
const indicatorVisible = computed(() => navIndex.value !== -1)
const updateIndicator = () => {
  const item = navList.value?.$el.querySelector('.active-item') as HTMLElement | null
  if (item) indicatorOffset.value = item.offsetTop + (item.offsetHeight - 28) / 2
}
let observer: ResizeObserver | undefined
onMounted(() => {
  updateIndicator()
  observer = new ResizeObserver(updateIndicator)
  if (navList.value) observer.observe(navList.value.$el)
})
watch(activeTab, updateIndicator, {flush: 'post'})
onBeforeUnmount(() => { observer?.disconnect(); if (navigationFrame !== null) cancelAnimationFrame(navigationFrame) })

const preloadNavigation = (value: string) => {
  if (preloadedRoutes.has(value)) return
  preloadedRoutes.add(value)
  void preloadRoute(value).catch(() => {
    // The router retries the import when the route is opened.
    preloadedRoutes.delete(value)
  })
}

const navigate = (value: string) => {
  const target = `/${value}`
  activeTab.value = value
  preloadNavigation(value)

  if (navigationFrame !== null) {
    cancelAnimationFrame(navigationFrame)
    navigationFrame = null
  }

  // Avoid re-running route guards and remounting a heavy view when the active
  // navigation item is clicked repeatedly.
  if (router.currentRoute.value.path === target) return

  const commitNavigation = () => {
    void router.push(target).catch((error) => {
      console.error('页面切换失败:', error)
    })
  }

  // Let the active indicator paint before a heavy route is torn down.  This
  // keeps the sidebar response immediate even when the current view is busy.
  if (typeof requestAnimationFrame === 'function') {
    navigationFrame = requestAnimationFrame(() => {
      navigationFrame = null
      commitNavigation()
    })
  } else {
    commitNavigation()
  }
}
</script>

<style scoped>
.fixed-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  z-index: 1000;
  isolation: isolate;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.045);
}

.logo-container {
  padding: 20px 0;
  margin: 0 12px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.app-logo {
  color: rgb(var(--v-theme-on-primary));
  opacity: 0.85;
  transition: transform var(--motion-fast) var(--ease-standard);
}

.app-logo:hover {
  transform: rotate(15deg) scale(1.1);
}

.nav-list {
  padding: 0 8px;
  position: relative;
}

.nav-item {
  min-height: 56px;
  margin: 4px 0;
  border-radius: 8px;
  transition: background-color var(--motion-fast) var(--ease-standard);
}

.nav-item:hover {
  background: rgba(var(--v-theme-on-primary), 0.08);
}

.nav-item.active-item {
  background: rgba(var(--v-theme-on-primary), 0.14);
  position: relative;
}

/* PCL2-style sliding active indicator, driven from the template. */
.nav-indicator {
  position: absolute;
  left: 0;
  top: 0;
  width: 3px;
  height: 28px;
  border-radius: 0 2px 2px 0;
  background: rgb(var(--v-theme-on-primary));
  transition:
      transform var(--motion-page) var(--ease-emphasized),
      opacity var(--motion-fast) var(--ease-standard);
  pointer-events: none;
}

/* 图标容器 */
.icon-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 48px;
  position: relative;
  transition: transform var(--motion-page) var(--ease-emphasized);
}

.active-item .icon-wrapper { transform: translateX(2px) scale(1.08); }
.nav-item:active .icon-wrapper { transform: scale(.94); }

.bottom-actions {
  width: 100%;
  padding: 16px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
  align-items: center;
}

.more-btn {
  margin: 0 !important;
  transform: rotate(0deg);
  transition: transform var(--motion-fast) var(--ease-standard);
}

.more-btn:hover {
  transform: rotate(180deg);
}

.tooltip-text {
  font-size: 0.85rem;
  padding: 6px 12px;
  color: white !important;
  border-radius: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .nav-indicator, .icon-wrapper, .app-logo, .more-btn { transition: none; }
}
</style>
