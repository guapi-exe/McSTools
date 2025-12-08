<script setup lang="ts">
import {isLeaving, navigationGuard} from "../../modules/navigation.ts";
import {opacity} from "../../modules/theme.ts";
import {onBeforeRouteLeave} from "vue-router";
import {onMounted, ref} from "vue";
import {appStore} from "../../modules/store.ts";
import {openDev} from "../../modules/dev_mode.ts";
import {clearThemeListeners, detectTheme, toast} from "../../modules/others.ts";
import {useTheme} from "vuetify/framework";
import {invoke} from "@tauri-apps/api/core";
import {openData} from "../../modules/copy_file.ts";
import {relaunch} from "@tauri-apps/plugin-process";
import {useI18n} from "vue-i18n";
const theme = useTheme()
const dialog = ref(false)
const autoUpdateEnabled = ref(true);
const devMode = ref(false);
const autoTheme = ref(false);
const { locale, t: $t } = useI18n()
const languageTypes = ref([
  {
    value: 'zh',
    label: '简体中文'
  },
  {
    value: 'zh_tw',
    label: '繁體中文'
  },
  {
    value: 'en',
    label: 'English'
  },
  {
    value: 'ja',
    label: '日本語'
  }
]);
const updateSources = ref([
  'https://github.com/guapi-exe/McSTools/releases/latest/download/latest.json'
]);
const selectedSource = ref('https://github.com/guapi-exe/McSTools/releases/latest/download/latest.json');
onBeforeRouteLeave(navigationGuard)
onMounted(async () => {
  autoUpdateEnabled.value = await appStore.get('autoUpdate', true)
  devMode.value = await appStore.get('devMode', false)
  autoTheme.value = await appStore.get('autoTheme', false)
  locale.value = await appStore.get('locale', 'zh')
})
const updateData = async () => {
  await appStore.set('autoUpdate', autoUpdateEnabled.value)
  await appStore.set('devMode', devMode.value)
  await appStore.set('autoTheme', autoTheme.value)
  await appStore.set('locale', locale.value)
  if (autoTheme.value) {
    await detectTheme(theme);
  }else {
    clearThemeListeners();
  }
}

const clearData = async () => {
  try {
    await invoke(
        'clear_app_data'
    )
    toast.info($t('messages.clearSuccess'), {
      timeout: 3000
    });
    await new Promise(resolve => setTimeout(resolve, 5000));
    await relaunch();
  } catch (error) {
    toast.error($t('messages.error', { error }), {
      timeout: 3000
    });
    throw new Error($t('messages.fetchError', { error }));
  }
}

</script>

<template class="page-wrapper">
  <v-row no-gutters
         class="mb-4 animate-row"
         :class="{ 'animate-row-out': isLeaving }"
  >
    <v-col cols="12" class="mb-4">
      <v-card class="mx-auto" :style="{ '--surface-alpha': opacity }" elevation="4">
        <v-toolbar density="compact" :style="{ '--surface-alpha': opacity + 0.2 }">
          <v-toolbar-title>
            <v-icon icon="mdi-update" class="mr-2"></v-icon>
            <span class="text-h7">{{ $t('settings.update.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-list class="pa-4" density="comfortable">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-autorenew" class="mr-2"></v-icon>
              </template>
              <v-list-item-title>{{ $t('settings.update.autoUpdate') }}</v-list-item-title>
              <template #append>
                <v-switch
                    v-model="autoUpdateEnabled"
                    color="info"
                    class="text-medium-emphasis"
                    @update:model-value="updateData"
                ></v-switch>
              </template>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-database-cog" class="mr-2"></v-icon>
              </template>
              <v-list-item-title>{{ $t('settings.update.source') }}</v-list-item-title>
              <template #append>
                <v-combobox
                    v-model="selectedSource"
                    :items="updateSources"
                    :disabled="true"
                    :label="$t('settings.update.sourcePlaceholder')"
                    variant="outlined"
                    density="compact"
                    class="mt-2"
                    style="width: 800px;"
                >
                  <template #no-data>
                    <v-list-item>
                      <v-list-item-title>
                        {{ $t('settings.update.sourceNoData') }}
                      </v-list-item-title>
                    </v-list-item>
                  </template>
                </v-combobox>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" class="mb-4">
      <v-card class="mx-auto" :style="{ '--surface-alpha': opacity }" elevation="4">
        <v-toolbar density="compact" class=" text-medium-emphasis" :style="{ '--surface-alpha': opacity + 0.2 }">
          <v-toolbar-title>
            <v-icon class="mr-2 "><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><path fill="#333333" fill-rule="evenodd" d="m7.04 1.361l.139-.057H21.32l.14.057l1.178 1.179l.057.139V16.82l-.057.14l-1.179 1.178l-.139.057H14V18a2 2 0 0 0-.548-1.375h7.673V2.875H7.375v7.282a5.7 5.7 0 0 0-1.571-.164V2.679l.057-.14L7.04 1.362zm9.531 9.452l-2.809 2.8a2 2 0 0 0-.348-.467l-.419-.42l2.236-2.235l-3.606-3.694l.813-.833l4.133 4.133zM9.62 14.82l1.32-1.32L12 14.56l-1.72 1.72l.22.22V18H12v1.45h-1.5v.1a6 6 0 0 1-.41 1.45L12 22.94L10.94 24l-1.65-1.65A4.3 4.3 0 0 1 6 24a4.31 4.31 0 0 1-3.29-1.65L1.06 24L0 22.94L1.91 21a6 6 0 0 1-.41-1.42v-.08H0V18h1.5v-1.5l.22-.22L0 14.56l1.06-1.06l1.32 1.32a3.73 3.73 0 0 1 7.24 0m-2.029-.661A2.25 2.25 0 0 0 3.75 15.75h4.5a2.25 2.25 0 0 0-.659-1.591m.449 7.38A3.33 3.33 0 0 0 9 19.5v-2.25H3v2.25a3.33 3.33 0 0 0 3 3a3.33 3.33 0 0 0 2.04-.96z" clip-rule="evenodd"/></svg></v-icon>
            <span class="text-h7">{{ $t('settings.debug.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-list class="pa-4" density="comfortable">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-autorenew" class="mr-2"></v-icon>
              </template>
              <v-list-item-title>{{ $t('settings.debug.enable') }}</v-list-item-title>
              <template #append>
                <v-switch
                    v-model="devMode"
                    color="info"
                    @update:model-value="updateData"
                ></v-switch>
              </template>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon class="mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><g fill="#0284c7"><path d="M10 11a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1m1 3a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2z"/><path fill-rule="evenodd" d="M9.094 4.75A4 4 0 0 1 8 2h2a2 2 0 1 0 4 0h2a4 4 0 0 1-1.094 2.75A6.02 6.02 0 0 1 17.659 8H19a1 1 0 1 1 0 2h-1v2h1a1 1 0 1 1 0 2h-1v2h1a1 1 0 1 1 0 2h-1.341A6.003 6.003 0 0 1 6.34 18H5a1 1 0 1 1 0-2h1v-2H5a1 1 0 1 1 0-2h1v-2H5a1 1 0 1 1 0-2h1.341a6.02 6.02 0 0 1 2.753-3.25M8 16v-6a4 4 0 1 1 8 0v6a4 4 0 0 1-8 0" clip-rule="evenodd"/></g></svg>
                </v-icon>
              </template>
              <v-list-item-title>{{ $t('settings.debug.open') }}</v-list-item-title>
              <template #append>
                <v-btn
                    :disabled="!devMode"
                    variant="outlined"
                    prepend-icon="mdi-update"
                    @click="openDev"
                >
                  {{ $t('settings.debug.openDev') }}
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" class="mb-4">
      <v-card class="mx-auto" :style="{ '--surface-alpha': opacity }" elevation="4">
        <v-toolbar density="compact" class="text-medium-emphasis" :style="{ '--surface-alpha': opacity + 0.2 }">
          <v-toolbar-title>
            <v-icon class="mr-2 ">
              mdi-palette
            </v-icon>
            <span class="text-h7">{{ $t('settings.theme.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-list class="pa-4" density="comfortable">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-autorenew" class="mr-2"></v-icon>
              </template>
              <v-list-item-title>{{ $t('settings.theme.autoTheme') }}</v-list-item-title>
              <template #append>
                <v-switch
                    v-model="autoTheme"
                    color="info"
                    @update:model-value="updateData"
                ></v-switch>
              </template>
            </v-list-item>

          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" class="mb-4">
      <v-card class="mx-auto" :style="{ '--surface-alpha': opacity }" elevation="4">
        <v-toolbar density="compact" class=" text-medium-emphasis" :style="{ '--surface-alpha': opacity + 0.2 }">
          <v-toolbar-title>
            <v-icon class="mr-2 ">
              mdi-file-cabinet
            </v-icon>
            <span class="text-h7">{{ $t('settings.resources.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-list class="pa-4" density="comfortable">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-trash-can-outline" class="mr-2"></v-icon>
              </template>
              <v-list-item-title>{{ $t('settings.resources.clear') }}</v-list-item-title>
              <template #append>
                <v-btn
                    variant="outlined"
                    color="red"
                    prepend-icon="mdi-information-outline"
                    @click="dialog = true"
                >
                  {{ $t('settings.resources.clearConfirm') }}
                </v-btn>
              </template>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-folder-file-outline" class="mr-2"></v-icon>
              </template>
              <v-list-item-title>{{ $t('settings.resources.openFolder') }}</v-list-item-title>
              <template #append>
                <v-btn
                    variant="outlined"
                    prepend-icon="mdi-file-arrow-up-down-outline"
                    @click="openData()"
                >
                  {{ $t('settings.resources.openFolderBtn') }}
                </v-btn>
              </template>
            </v-list-item>

          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12" class="mb-4">
      <v-card class="mx-auto" :style="{ '--surface-alpha': opacity }" elevation="4">
        <v-toolbar density="compact" class=" text-medium-emphasis" :style="{ '--surface-alpha': opacity + 0.2 }">
          <v-toolbar-title>
            <v-icon class="mr-2">
              mdi-translate
            </v-icon>
            <span class="text-h7">{{ $t('settings.language.title') }}</span>
          </v-toolbar-title>
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-list class="pa-4" density="comfortable">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-translate" class="mr-2"></v-icon>
              </template>
              <v-list-item-title>{{ $t('settings.language.title') }}</v-list-item-title>
              <template #append>
                <v-select
                    v-model="locale"
                    :label="$t('settings.language.select')"
                    :items="languageTypes"
                    item-title="label"
                    item-value="value"
                    style="width: 400px;"
                    @update:model-value="updateData"
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
  <v-dialog
      v-model="dialog"
      max-width="500"
      persistent
  >
    <v-card
        max-width="500"
        width="500"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon icon="mdi-history" class="mr-2"></v-icon>
        {{ $t('settings.resources.clearConfirm') }}
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{ $t('settings.resources.clearWarning') }}
      </v-card-subtitle>

      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialog = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn
            class="ms-auto"
            text="再次确认"
            color="info"
            @click="clearData()"
        ></v-btn>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>

</style>