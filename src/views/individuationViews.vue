<script setup lang="ts">
import {onMounted, ref, watch} from 'vue';
import {navigationGuard} from "../modules/navigation.ts";
import {onBeforeRouteLeave} from "vue-router";
import {appStore} from '../modules/store.ts';
import {saveImage} from "../modules/uploadImage.ts";
import {useTheme} from "vuetify/framework";
import {
  backgroundOpacity,
  backgroundUrl,
  initTheme,
  layoutMode,
  opacity,
  removeCustomFont,
  resolveBackgroundLayout
} from "../modules/theme.ts";
import {useI18n} from 'vue-i18n';
import {saveFont} from "../modules/fonts.ts";

const { t } = useI18n()
const selectedTheme = ref('grey');
const backgroundImage = ref('null');
const backgroundSize = ref<number>();
const backgroundDimensions = ref();
const backgroundName = ref();
const fontPath = ref();
const fontName = ref();
const fontSize = ref();
const background = ref();
const font = ref();
const theme = useTheme()
const layoutModes = [
  { label: t('individuation.background.layoutModes.stretch'), value: 'stretch', color: 'red-darken-2' },
  { label: t('individuation.background.layoutModes.repeat'), value: 'repeat', color: 'teal-darken-2' },
  { label: t('individuation.background.layoutModes.contain'), value: 'contain', color: 'purple-darken-2' },
  { label: t('individuation.background.layoutModes.cover'), value: 'cover', color: 'blue-darken-2' },
];
const themes = [
  { label: t('individuation.theme.options.grey'), value: 'grey', color: 'bg-blue-grey-lighten-5', icon: 'mdi-weather-sunny' },
  { label: t('individuation.theme.options.blue'), value: 'blue', color: 'blue-darken-2', icon: 'mdi-weather-sunny' },
  { label: t('individuation.theme.options.darkBlue'), value: 'dark_blue', color: 'indigo-darken-3', icon: 'mdi-moon-waning-crescent' },
  { label: t('individuation.theme.options.green'), value: 'green', color: 'teal-darken-2', icon: 'mdi-leaf' },
  { label: t('individuation.theme.options.orange'), value: 'orange', color: 'orange-darken-2', icon: 'mdi-fire' },
  { label: t('individuation.theme.options.yellow'), value: 'yellow', color: 'yellow-darken-3', icon: 'mdi-fruit-pineapple' },
  { label: t('individuation.theme.options.brown'), value: 'brown', color: 'brown-darken-3', icon: 'mdi-square-rounded' },
  { label: t('individuation.theme.options.whiteDark'), value: 'white_dark', color: 'indigo-lighten-3', icon: 'mdi-weather-night' },
  { label: t('individuation.theme.options.greyDark'), value: 'grey_dark', color: 'black-darken-3', icon: 'mdi-moon-waning-crescent' },
]
onBeforeRouteLeave(navigationGuard)

onMounted(async () => {
  selectedTheme.value = await appStore.get('selectedTheme', 'blue');
  backgroundImage.value = await appStore.get('backgroundImage', 'null');
  backgroundSize.value = await appStore.get('backgroundSize', 0);
  backgroundDimensions.value = await appStore.get('backgroundDimensions', "null")
  backgroundName.value = await appStore.get('backgroundName', "null")
  fontName.value = await appStore.get('fontName', "null")
  fontSize.value = await appStore.get('fontSize', "null")
  fontPath.value = await appStore.get('fontPath', "null")
  theme.global.name.value = selectedTheme.value
});

// All changes below apply instantly through the reactive theme refs — no
// page refresh involved (initTheme updates backgroundUrl / the FontFace).
const updateBackGround = async (file: File | undefined) => {
  const data = await saveImage(file)
  if (!data) return
  await appStore.set('backgroundImage', data.path);
  await appStore.set('backgroundSize', data.size)
  await appStore.set('backgroundDimensions', data.dimensions)
  await appStore.set('backgroundName', data.name)
  backgroundImage.value = data.path
  backgroundSize.value = data.size
  backgroundDimensions.value = data.dimensions
  backgroundName.value = data.name
  await initTheme();
}

const updateFont = async (file: File | undefined) => {
  const data = await saveFont(file)
  if (!data) return
  await appStore.set('fontPath', data.path);
  await appStore.set('fontSize', data.size)
  await appStore.set('fontName', data.name)
  fontPath.value = data.path
  fontSize.value = data.size
  fontName.value = data.name
  await initTheme();
}

const clearBackGround = async () => {
  await appStore.set('backgroundImage', 'null');
  await appStore.set('backgroundSize', 0)
  await appStore.set('backgroundDimensions', 'null')
  await appStore.set('backgroundName', 'null')
  backgroundImage.value = 'null'
  backgroundDimensions.value = 'null'
  backgroundName.value = 'null'
  await initTheme();
}

const clearFont = async () => {
  await appStore.set('fontPath', 'null');
  await appStore.set('fontSize', 0)
  await appStore.set('fontName', 'null')
  fontPath.value = 'null'
  fontSize.value = 'null'
  fontName.value = 'null'
  removeCustomFont();
  document.body.style.fontFamily = '';
  await initTheme();
}

watch(selectedTheme, (val) => {
  theme.global.name.value = val
  appStore.set('selectedTheme', val)
  // The last manually chosen light theme is what "system dark" restores to.
  if (val !== 'grey_dark' && val !== 'white_dark') {
    appStore.set('oldTheme', val)
  }
});
watch(layoutMode, (val) => appStore.setDebounced('layoutMode', val));
watch(opacity, (val) => appStore.setDebounced('opacity', val));
watch(backgroundOpacity, (val) => appStore.setDebounced('backgroundOpacity', val));
</script>

<template>
  <div class="page-view">
  <v-row no-gutters
         class="mb-4 animate-row "
  >
    <v-col class="mb-4" cols="12">
        <v-card class="mx-auto v-theme--custom text-primary " elevation="2">
          <v-toolbar density="compact" class="bg-surface-container pa-3">
            <v-toolbar-title>
              <v-icon icon="mdi-palette text-medium-emphasis" class="mr-2"></v-icon>
              <span class="text-h6 text-medium-emphasis">{{ t('individuation.title') }}</span>
            </v-toolbar-title>
          </v-toolbar>

          <v-card-text class="pa-6">
            <v-card variant="flat" class="mb-3 bg-surface-container">
              <v-card-text>
                <v-row align="center">
                  <v-col cols="2">
                    <div class="d-flex align-center">
                      <v-icon icon="mdi-opacity text-medium-emphasis" class="mr-2"></v-icon>
                      <span class="text-subtitle-1 text-medium-emphasis">{{ t('individuation.opacity.title') }}</span>
                    </div>
                  </v-col>
                  <v-col cols="10">
                    <div class="d-flex align-center">
                      <v-slider
                          v-model="opacity"
                          :max="1"
                          :min="0.2"
                          thumb-label
                          track-color="blue-grey-lighten-3"
                          color="blue-darken-2"
                          class="mr-4"
                      ></v-slider>
                      <v-chip
                          color="blue-darken-2"
                          label
                          class="text-white"
                      >
                        {{ t('individuation.opacity.value', { value: Math.round(opacity * 100) }) }}
                      </v-chip>
                    </div>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
            <v-card variant="flat" class="bg-surface-container">
              <v-card-text>
                <v-row align="center" justify="center">
                  <v-col cols="2">
                    <div class="d-flex align-center">
                      <v-icon icon="mdi-theme-light-dark text-medium-emphasis" class="mr-2"></v-icon>
                      <span class="text-subtitle-1 text-medium-emphasis">{{ t('individuation.theme.title') }}</span>
                    </div>
                  </v-col>
                  <v-col cols="10">
                    <div class="d-flex flex-wrap gap-3">
                      <v-radio-group
                          v-model="selectedTheme"
                          inline
                          hide-details
                      >
                        <v-radio
                            v-for="theme in themes"
                            :key="theme.value"
                            :color="theme.color"
                            :value="theme.value"
                            class="text-medium-emphasis"
                        >
                          <template v-slot:label>
                            <v-chip
                                :color="theme.color"
                                :variant="selectedTheme === theme.value ? 'elevated' : 'outlined'"
                                class="ma-1"
                            >
                              <v-icon left :icon="theme.icon"></v-icon>
                              {{ theme.label }}
                            </v-chip>
                          </template>
                        </v-radio>
                      </v-radio-group>
                    </div>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-card-text>
        </v-card>
    </v-col>
    <v-col class="mb-4" cols="12">
      <v-card class="mx-auto" elevation="2">
        <v-toolbar density="compact" class="bg-surface-container pa-3">
          <v-toolbar-title>
            <v-icon icon="mdi-image text-medium-emphasis" class="mr-2"></v-icon>
            <span class="text-h6 text-medium-emphasis">{{ t('individuation.background.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-row class="preview-layout mb-4" v-if="backgroundImage != 'null'">
            <v-col cols="6" class="image-column">
              <v-img
                  :aspect-ratio="16/9"
                  :style="{
                    backgroundColor: `rgba(255,255,255, ${1 - backgroundOpacity})`,
                    backgroundImage: `url(${backgroundUrl})`,
                    backgroundSize: resolveBackgroundLayout(layoutMode).backgroundSize,
                    backgroundRepeat: resolveBackgroundLayout(layoutMode).backgroundRepeat,
                    backgroundPosition: 'center',
                  }"
                  contain
                  transition="fade-transition"
                  class="image-preview rounded-lg"
              >
                <template #default>
                  <div class="opacity-control pa-2">
                    <v-slider
                        v-model="backgroundOpacity"
                        :max="1"
                        color="info"
                        thumb-label
                    >
                      <template #prepend>
                        <v-icon>mdi-opacity</v-icon>
                      </template>
                    </v-slider>
                  </div>
                </template>
              </v-img>
            </v-col>

            <v-col cols="6" class="info-column">
              <v-card class="h-100" elevation="2">
                <v-card-title class="d-flex align-center">
                  <v-icon left>mdi-information</v-icon>
                  {{ t('individuation.background.imageInfo') }}
                </v-card-title>

                <v-divider></v-divider>

                <v-card-text>
                  <v-list density="compact" >
                    <v-list-item>
                      <template #prepend>
                        <v-icon>mdi-file</v-icon>
                      </template>
                      <v-list-item-title>{{ t('individuation.background.fileName') }}</v-list-item-title>
                      <v-list-item-subtitle>{{ backgroundName }}</v-list-item-subtitle>
                    </v-list-item>

                    <v-list-item>
                      <template #prepend>
                        <v-icon>mdi-weight</v-icon>
                      </template>
                      <v-list-item-title>{{ t('individuation.background.fileSize') }}</v-list-item-title>
                      <v-list-item-subtitle>{{ backgroundSize?.toFixed(2) }} kb</v-list-item-subtitle>
                    </v-list-item>

                    <v-list-item>
                      <template #prepend>
                        <v-icon>mdi-arrow-expand</v-icon>
                      </template>
                      <v-list-item-title>{{ t('individuation.background.resolution') }}</v-list-item-title>
                      <v-list-item-subtitle>{{ backgroundDimensions }}</v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </v-card-text>

                <v-card-actions class="justify-end">
                  <v-btn
                      color="error"
                      variant="flat"
                      @click="clearBackGround"
                  >
                    <v-icon left>mdi-delete</v-icon>
                    {{ t('individuation.background.actions.clear') }}
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>

          <v-row class="mb-4">
            <v-col cols="12">
              <v-file-input
                  v-model="background"
                  accept="image/png, image/jpeg, image/bmp"
                  :label="t('individuation.background.actions.select')"
                  density="compact"
                  show-size
                  prepend-icon="mdi-folder-open"
                  @update:model-value="updateBackGround(background)"
              ></v-file-input>
            </v-col>
          </v-row>
          <v-card variant="flat" class="bg-surface-container mb-3">
            <v-card-text class="pa-6">
              <v-row align="center" >
                <v-col cols="2" class="d-flex align-center text-medium-emphasis">
                  <v-icon icon="mdi-opacity" class="mr-2"></v-icon>
                  <span>{{ t('individuation.opacity.title') }}</span>
                </v-col>
                <v-col cols="10">
                  <div class="d-flex align-center">
                    <v-slider
                        v-model="backgroundOpacity"
                        :max="1"
                        :min="0.2"
                        thumb-label
                        track-color="blue-grey-lighten-3"
                        color="blue-darken-2"
                        class="mr-4"
                    ></v-slider>
                    <v-chip
                        color="blue-darken-2"
                        label
                        class="text-white"
                    >
                      {{ Math.round(backgroundOpacity * 100) }}%
                    </v-chip>
                  </div>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-card variant="flat" class="bg-surface-container mb-2">
            <v-card-text class="pa-6">
              <v-row align="center">
                <v-col cols="2" class="d-flex align-center text-medium-emphasis">
                  <v-icon icon="mdi-image-area" class="mr-2"></v-icon>
                  <span>{{ t('individuation.background.layoutMode') }}</span>
                </v-col>
                <v-col cols="10">
                  <v-radio-group
                      v-model="layoutMode"
                      inline
                      hide-details
                  >
                    <v-radio
                        v-for="mode in layoutModes"
                        :key="mode.value"
                        :value="mode.value"
                        :color="mode.color"
                        class="text-medium-emphasis"
                    >
                      <template v-slot:label>
                        <v-chip
                            :color="mode.color"
                            :variant="layoutMode === mode.value ? 'elevated' : 'outlined'"
                            class="ma-1"
                        >
                          {{ mode.label }}
                        </v-chip>
                      </template>
                    </v-radio>
                  </v-radio-group>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

        </v-card-text>
      </v-card>
    </v-col>
    <v-col class="mb-4" cols="12">
      <v-card class="mx-auto" elevation="2">
        <v-toolbar density="compact" class="bg-surface-container pa-3">
          <v-toolbar-title>
            <v-icon icon="mdi-format-font text-medium-emphasis" class="mr-2"></v-icon>
            <span class="text-h6 text-medium-emphasis">{{ t('individuation.font.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-row class="font-layout mb-4" v-if="fontPath != 'null'">
            <v-col cols="6" class="image-column">
              <h2 class="text-h5 mb-4">{{ t('individuation.font.effect.title') }}</h2>

              <div class="mb-5">
                <p class="sample-text chinese">
                  {{ t('individuation.font.effect.content1') }}
                </p>
                <p class="sample-text chinese bold">
                  {{ t('individuation.font.effect.content2') }}
                </p>
              </div>

              <div class="mb-5">
                <p class="sample-text english">
                  {{ t('individuation.font.effect.content3') }}
                </p>
                <p class="sample-text english italic">
                  <i>{{ t('individuation.font.effect.content4') }}</i>
                </p>
              </div>

              <div>
                <p class="sample-text numbers">
                  {{ t('individuation.font.effect.content5') }}
                </p>
                <p class="sample-text numbers transformed">
                  {{ t('individuation.font.effect.content6') }}
                </p>
              </div>
            </v-col>

            <v-col cols="6" class="info-column">
              <v-card class="h-100" elevation="2">
                <v-card-title class="d-flex align-center">
                  <v-icon left>mdi-information</v-icon>
                  {{ t('individuation.font.fontInfo') }}
                </v-card-title>

                <v-divider></v-divider>

                <v-card-text>
                  <v-list density="compact" >
                    <v-list-item>
                      <template #prepend>
                        <v-icon>mdi-file</v-icon>
                      </template>
                      <v-list-item-title>{{ t('individuation.font.fileName') }}</v-list-item-title>
                      <v-list-item-subtitle>{{ fontName }}</v-list-item-subtitle>
                    </v-list-item>

                    <v-list-item>
                      <template #prepend>
                        <v-icon>mdi-weight</v-icon>
                      </template>
                      <v-list-item-title>{{ t('individuation.font.fileSize') }}</v-list-item-title>
                      <v-list-item-subtitle>{{ fontSize?.toFixed(2) }} kb</v-list-item-subtitle>
                    </v-list-item>

                  </v-list>
                </v-card-text>

                <v-card-actions class="justify-end">
                  <v-btn
                      color="error"
                      variant="flat"
                      @click="clearFont"
                  >
                    <v-icon left>mdi-delete</v-icon>
                    {{ t('individuation.font.actions.clear') }}
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>

          <v-row class="mb-4">
            <v-col cols="12">
              <v-file-input
                  v-model="font"
                  accept=".ttf, .woff, .woff2, font/ttf, font/woff, font/woff2"
                  :label="t('individuation.font.actions.select')"
                  density="compact"
                  show-size
                  prepend-icon="mdi-folder-open"
                  @update:model-value="updateFont(font)"
              ></v-file-input>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
  </div>
</template>

<style scoped lang="css" src="../assets/css/individuation.css"></style>