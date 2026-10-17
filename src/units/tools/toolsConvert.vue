<script setup lang="ts">
import bgImg from '../../static/img/bg.jpg'
import createImg from '../../static/img/create.jpg'
import lmImg from '../../static/img/Litematica.jpg'
import weImg from '../../static/img/wordEdit.png'
import beImg from '../../static/img/grass_block.png'
import {defineProps, computed, reactive, ref, onMounted, watch} from "vue";
import {ConvertData, fetchConvertData} from "../../modules/convert_data.ts";
import {fetchSchematicGameVersions, GameVersionOption} from "../../modules/schematics_data.ts";
import {toast} from "../../modules/others.ts";
import {invoke} from "@tauri-apps/api/core";
import {convertData, schematic_id, schematicData} from "../../modules/tools_data.ts";
import {copySchematic} from "../../modules/copy_file.ts";
import { useI18n } from 'vue-i18n';
const props = defineProps<{
  data: ConvertData | undefined,
}>()
  const { t: $t } = useI18n();
const showSubVersions1 = ref(false);
const dialogVersions1 = ref(false);
const isLoading = ref(false);
const showSubVersions2 = ref(false);
const dialogVersions2 = ref(false);
const showSubVersions3 = ref(false);
const dialogVersions3 = ref(false);
const showSubVersions4 = ref(false);
const dialogVersions4 = ref(false);
const showSubVersions5 = ref(false);
const showSubVersions6 = ref(false);
const dialogVersions6 = ref(false);
const lmVersion = ref(6)
const weVersion = ref(0)
const bgVersion = ref(0)
const javaVersionNames = ref<string[]>([])
const targetGameVersions = reactive<Record<string, GameVersionOption[]>>({})
const targetJavaVersions = reactive<Record<string, string>>({
  '1:-1': '1.20.4',
  '2:-1': '1.20.4',
  '3:0': '1.20.4',
  '3:1': '1.20.4',
  '4:0': '1.20.4',
  '4:1': '1.20.4',
  '4:2': '1.20.4',
})
const targetVersionLoadingByKey = reactive<Record<string, boolean>>({})
const legacyVersion = ref('1.7.10')
const legacyTargetVersions = ref<GameVersionOption[]>([])
const viAir = ref(false)
const dialogVersions5 = ref(false);
let javaVersionsPromise: Promise<void> | undefined
const targetVersionRequests = new Map<string, number>()

const targetVersionKey = (schematicType: number, schematicSubType = -1) =>
  `${schematicType}:${[3, 4].includes(schematicType) ? schematicSubType : -1}`

const targetVersionOptions = (schematicType: number, schematicSubType = -1) =>
  targetGameVersions[targetVersionKey(schematicType, schematicSubType)] ?? []

const targetVersionValue = (schematicType: number, schematicSubType = -1) =>
  targetJavaVersions[targetVersionKey(schematicType, schematicSubType)] ?? ''

const targetVersionIsDisabled = (schematicType: number, schematicSubType = -1) => {
  const key = targetVersionKey(schematicType, schematicSubType)
  return targetVersionLoadingByKey[key] === true || targetVersionOptions(schematicType, schematicSubType).length === 0
}

const legacyTargetVersionLoading = ref(false)
const legacyTargetVersionDisabled = computed(
  () => legacyTargetVersionLoading.value || legacyTargetVersions.value.length === 0,
)

const litematicaOutputVersions = [3, 4, 5, 6, 7].map(value => ({
  value,
  label: `Litematica v${value}`,
}))
const worldEditOutputVersions = computed(() => [
  {value: 0, label: $t('toolsConvert.weSubVersion0')},
  {value: 1, label: $t('toolsConvert.weSubVersion1')},
])
const builderOutputVersions = computed(() => [
  {value: 0, label: $t('toolsConvert.bgSubVersion0')},
  {value: 1, label: $t('toolsConvert.bgSubVersion1')},
  {value: 2, label: $t('toolsConvert.bgSubVersion2')},
])
const formatInfo = computed(() => {
  switch(props.data?.schematic_type_id) {
    case 1:
      return {
        img: createImg,
        ext: 'nbt',
        title: $t('toolsConvert.createTitle'),
        desc: $t('toolsConvert.createDesc'),
        icon: 'mdi-cube'
      }
    case 2:
      return {
        img: lmImg,
        ext: 'litematic',
        title: $t('toolsConvert.litematicTitle'),
        desc: $t('toolsConvert.litematicDesc'),
        icon: 'mdi-vector-square'
      }
    case 3:
      return {
        img: weImg,
        title: $t('toolsConvert.weTitle'),
        ext: 'schem',
        desc: $t('toolsConvert.weDesc'),
        icon: 'mdi-vector-square'
      }
    case 4:
      return {
        img: bgImg,
        title: $t('toolsConvert.bgTitle'),
        ext: 'json',
        desc: $t('toolsConvert.bgDesc'),
        icon: 'mdi-vector-square'
      }
    case 5:
      return {
        img: beImg,
        title: $t('toolsConvert.beTitle'),
        ext: 'mcstructure',
        desc: $t('toolsConvert.beDesc'),
        icon: 'mdi-vector-square'
      }
      case 6:
        return {
          img: weImg,
          title: $t('toolsConvert.mcEditTitle'),
          ext: 'schematic',
          desc: $t('toolsConvert.mcEditDesc'),
          icon: 'mdi-vector-square'
        }
    default:
      return {
        img: beImg,
        title: $t('toolsConvert.unknownTitle'),
        ext: 'unknow',
        desc: $t('toolsConvert.unknownDesc'),
        icon: 'mdi-help-circle'
      }
  }
});
const convertSchematic = async (schematicType: number) => {
  try {
    isLoading.value = true;
    const targetSubVersion = schematicType === 3
      ? weVersion.value
      : schematicType === 4
        ? bgVersion.value
        : -1
    const result = await invoke<boolean>('convert', {
      id: schematic_id.value,
      schematicType: schematicType,
      lmVersion: lmVersion.value,
      weVersion: weVersion.value,
      bgVersion: bgVersion.value,
      jeVersion: targetVersionValue(schematicType, targetSubVersion),
      legacyVersion: legacyVersion.value,
      viAir: viAir.value
    });
    if (result) {
      convertData.value = await fetchConvertData(schematic_id.value)
    }
    toast.success($t('toolsConvert.convertSuccess'), {
      timeout: 3000
    });
  } catch (err) {

    toast.error($t('toolsConvert.error', { error: err }), {
      timeout: 3000
    });
    throw err
  } finally {
    isLoading.value = false;
  }
}

const loadJavaTargetVersions = (): Promise<void> => {
  if (javaVersionsPromise) {
    return javaVersionsPromise
  }

  javaVersionsPromise = Promise.all([
    invoke<string[]>('get_java_block_versions'),
  ]).then(([versions]) => {
    if (versions.length > 0) {
      javaVersionNames.value = versions
    }
  }).catch(error => {
    javaVersionsPromise = undefined
    console.warn('Unable to load Java target versions', error)
    throw error
  })

  return javaVersionsPromise
}

const loadLegacyTargetVersions = async () => {
  legacyTargetVersionLoading.value = true
  try {
    const options = await fetchSchematicGameVersions(6, -1)
    legacyTargetVersions.value = options
    if (!options.some(option => option.name === legacyVersion.value)) {
      legacyVersion.value = options[0]?.name ?? ''
    }
  } catch (error) {
    legacyTargetVersions.value = []
    console.warn('Unable to load legacy target versions', error)
  } finally {
    legacyTargetVersionLoading.value = false
  }
}

const loadTargetGameVersions = async (schematicType: number, schematicSubType = -1) => {
  if (![1, 2, 3, 4].includes(schematicType)) {
    return
  }

  const key = targetVersionKey(schematicType, schematicSubType)
  const request = (targetVersionRequests.get(key) ?? 0) + 1
  targetVersionRequests.set(key, request)
  targetVersionLoadingByKey[key] = true
  targetGameVersions[key] = []
  try {
    await loadJavaTargetVersions()
    const options = await fetchSchematicGameVersions(schematicType, schematicSubType)
    const supported = new Set(javaVersionNames.value)
    const filteredOptions = options.filter(option => supported.has(option.name))
    if (request !== targetVersionRequests.get(key)) {
      return
    }
    targetGameVersions[key] = filteredOptions
    if (!targetGameVersions[key].some(option => option.name === targetJavaVersions[key])) {
      targetJavaVersions[key] = targetGameVersions[key][targetGameVersions[key].length - 1]?.name ?? ''
    }
  } catch (error) {
    if (request === targetVersionRequests.get(key)) {
      targetGameVersions[key] = []
      console.warn('Unable to load target game versions', error)
    }
  } finally {
    if (request === targetVersionRequests.get(key)) {
      targetVersionLoadingByKey[key] = false
    }
  }
}

const openConversionDialog = async (schematicType: number, schematicSubType = -1) => {
  if (schematicType === 3) {
    weVersion.value = schematicSubType
  }
  if (schematicType === 4) {
    bgVersion.value = schematicSubType
  }
  if ([1, 2, 3, 4].includes(schematicType)) {
    await loadTargetGameVersions(schematicType, schematicSubType)
  } else if (schematicType === 6) {
    await loadLegacyTargetVersions()
  }

  switch (schematicType) {
    case 1:
      dialogVersions1.value = true
      break
    case 2:
      dialogVersions2.value = true
      break
    case 3:
      dialogVersions3.value = true
      break
    case 4:
      dialogVersions4.value = true
      break
    case 5:
      dialogVersions5.value = true
      break
    case 6:
      dialogVersions6.value = true
      break
  }
}

watch(weVersion, (version, previousVersion) => {
  if (dialogVersions3.value && version !== previousVersion) {
    void loadTargetGameVersions(3, version)
  }
})

watch(bgVersion, (version, previousVersion) => {
  if (dialogVersions4.value && version !== previousVersion) {
    void loadTargetGameVersions(4, version)
  }
})

onMounted(() => {
  void loadJavaTargetVersions().catch(() => undefined)
})
</script>

<template>
  <v-row>
    <v-col cols="12">
      <v-alert
          variant="tonal"
          color="info"
          icon="mdi-information"
          class="mt-4"
      >
  {{$t('toolsConvert.longTimeTip')}}
      </v-alert>
    </v-col>
  </v-row>

  <v-container class="pa-3">
    <v-row class="conversion-flow" justify="center" no-gutters>
      <v-col cols="12" md="6">
        <v-card class="format-card elevation-3" hover>
          <v-row no-gutters align="center">
            <v-col cols="4">
              <v-img
                  :src="formatInfo.img"
                  height="120"
                  cover
                  class="card-image"
              ></v-img>
            </v-col>

            <v-col cols="8" class="pa-4">
              <div class="meta-info">
                <div class="d-flex justify-space-between">
                  <span class="text-caption text-grey">{{$t('toolsConvert.extType')}}</span>
                  <span class="text-caption">{{ formatInfo.ext }}</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.originSize')}}</span>
                  <span class="text-caption font-weight-medium">{{ ((Number(props.data?.size) ?? 0) / 1024).toFixed(2) + ' KB' }}</span>
                </div>
                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.version')}}</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-tag"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">v {{ props.data?.version }}</span>
                  </div>

                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.subVersion')}}</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-check-circle"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">v {{ props.data?.sub_type }}</span>
                  </div>
                </div>
              </div>
              <v-divider class="my-2"></v-divider>
            </v-col>
          </v-row>

          <v-card-item>
            <v-card-title class="text-h5 font-weight-bold text-blue-darken-2">
              <v-icon icon="mdi-vector-square" size="28" class="mr-2"></v-icon>
              {{ formatInfo.title }}
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              {{ formatInfo.desc }}
            </v-card-subtitle>
          </v-card-item>
        </v-card>
      </v-col>
    </v-row>
    <v-row class="conversion-flow py-9" justify="center" no-gutters>
      <v-col cols="12" md="2" class="text-center">
        <v-icon size="48" class="transition-swing">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="96" viewBox="0 0 256 512"><path fill="#0284c7" d="M145.6 7.7C141 2.8 134.7 0 128 0s-13 2.8-17.6 7.7l-104 112c-6.5 7-8.2 17.2-4.4 25.9S14.5 160 24 160h56v192H24c-9.5 0-18.2 5.7-22 14.4s-2.1 18.9 4.4 25.9l104 112c4.5 4.9 10.9 7.7 17.6 7.7s13-2.8 17.6-7.7l104-112c6.5-7 8.2-17.2 4.4-25.9S241.5 352 232 352h-56V160h56c9.5 0 18.2-5.7 22-14.4s2.1-18.9-4.4-25.9z"/></svg>
        </v-icon>
  <div class=" text-blue-grey-darken-1 mt-6">{{$t('toolsConvert.oneClick')}}</div>
      </v-col>
    </v-row>
    <v-row class="conversion-flow" justify="center">
      <v-col cols="6"
             @mouseenter="showSubVersions2 = true;"
             @mouseleave="showSubVersions2 = false"
      >
        <v-card class="format-card elevation-3"
                hover
        >
          <v-row no-gutters align="center">
            <v-col cols="4">
              <v-img
                  :src="lmImg"
                  height="120"
                  cover
                  class="card-image"
              ></v-img>
            </v-col>

            <v-col cols="8" class="pa-4">
              <div class="meta-info">
                <div class="d-flex justify-space-between">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.extType') }}:</span>
                  <span class="text-caption">litematic</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.gzipCompression')}}</span>
                  <v-icon
                      color="success"
                      size="16"
                      icon="mdi-check-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.version') }}:</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-tag"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">v {{ props.data?.version }}</span>
                  </div>

                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.hasSubVersion')}}</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-check-circle"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">1</span>
                  </div>
                </div>
              </div>
              <v-divider class="my-2"></v-divider>
            </v-col>
          </v-row>

          <v-card-item>
            <v-card-title class="text-h5 font-weight-bold text-blue-darken-2">
              <v-icon icon="mdi-cube-scan" size="28" class="mr-2"></v-icon>
              {{$t('toolsConvert.litematicTitle')}}
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              {{$t('toolsConvert.litematicDesc')}}
            </v-card-subtitle>

          </v-card-item>
          <v-expand-transition>
            <v-card v-if="showSubVersions2"
                    class="position-absolute w-100"
                    height="100%"
                    style="bottom: 0;"
                    hover>
              <v-card-title class="text-subtitle-1">
                <v-icon icon="mdi-history" class="mr-2"></v-icon>
                {{$t('toolsConvert.availableSubVersion')}}
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="12">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">{{$t('toolsConvert.extType')}}</span>
                        <span class="text-caption">litematic</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.originSize')}}</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Litematic?.["-1"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.subVersion')}}</span>
                        <span class="text-caption font-weight-medium">-1</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.exist')}}</span>
                        <div>
                          <v-icon
                              :color="props.data?.schematics?.Litematic == undefined? 'error' : 'success'"
                              size="16"
                              :icon="props.data?.schematics?.Litematic == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                          >
                          </v-icon>
                        </div>
                      </div>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-col cols="12" class="justify-end" style="position: relative">
                      <v-btn
                          variant="text"
                          color="info"
                          @click="openConversionDialog(2)"
                      >
                        <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                        {{$t('toolsConvert.convertToThis')}}
                      </v-btn>

                    </v-col>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-expand-transition>
        </v-card>
      </v-col>
      <v-col cols="6"
             @mouseenter="showSubVersions1 = true;"
             @mouseleave="showSubVersions1 = false"
      >
        <v-card class="format-card elevation-3" hover>
          <v-row no-gutters align="center">
            <v-col cols="4">
              <v-img
                  :src="createImg"
                  height="120"
                  cover
                  class="card-image"
              ></v-img>
            </v-col>

            <v-col cols="8" class="pa-4">
              <div class="meta-info">
                <div class="d-flex justify-space-between">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.extType') }}:</span>
                  <span class="text-caption">nbt</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.gzipCompression')}}</span>
                  <v-icon
                      color="success"
                      size="16"
                      icon="mdi-check-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.version') }}:</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-tag"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">v {{ props.data?.version }}</span>
                  </div>

                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.hasSubVersion')}}</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-check-circle"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">1</span>
                  </div>
                </div>
              </div>
              <v-divider class="my-2"></v-divider>
            </v-col>
          </v-row>
          <v-card-item>
            <v-card-title class="text-h5 font-weight-bold text-blue-darken-2">
              <v-icon icon="mdi-cube-scan" size="28" class="mr-2"></v-icon>
              {{$t('toolsConvert.createTitle')}}
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              {{$t('toolsConvert.createDesc')}}
            </v-card-subtitle>
          </v-card-item>
          <v-expand-transition>
            <v-card v-if="showSubVersions1"
                    class="position-absolute w-100"
                    height="100%"
                    style="bottom: 0;"
                    hover>
              <v-card-title class="text-subtitle-1">
                <v-icon icon="mdi-history" class="mr-2"></v-icon>
                {{$t('toolsConvert.availableSubVersion')}}
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="12">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">{{$t('toolsConvert.extType')}}</span>
                        <span class="text-caption">nbt</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.originSize')}}</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Create?.["-1"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.subVersion')}}</span>
                        <span class="text-caption font-weight-medium">-1</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.exist')}}</span>
                        <div>
                          <v-icon
                              :color="props.data?.schematics?.Create == undefined? 'error' : 'success'"
                              size="16"
                              :icon="props.data?.schematics?.Create == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                          >
                          </v-icon>
                        </div>
                      </div>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-col cols="12" class="justify-end">
                      <v-btn
                          variant="text"
                          color="info"
                          @click="openConversionDialog(1)"
                      >
                        <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                        {{$t('toolsConvert.convertToThis')}}
                      </v-btn>
                    </v-col>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-expand-transition>
        </v-card>
      </v-col>
      <v-col cols="6"
             @mouseenter="showSubVersions3 = true;"
             @mouseleave="showSubVersions3 = false"
      >
        <v-card class="format-card elevation-3" hover>
          <v-row no-gutters align="center">
            <v-col cols="4">
              <v-img
                  :src="weImg"
                  height="120"
                  cover
                  class="card-image"
              ></v-img>
            </v-col>

            <v-col cols="8" class="pa-4">
              <div class="meta-info">
                <div class="d-flex justify-space-between">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.extType') }}:</span>
                  <span class="text-caption">schem</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.gzipCompression')}}</span>
                  <v-icon
                      color="success"
                      size="16"
                      icon="mdi-check-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.version') }}:</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-tag"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">v {{ props.data?.version }}</span>
                  </div>

                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{$t('toolsConvert.hasSubVersion')}}</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-check-circle"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">2</span>
                  </div>
                </div>
              </div>
              <v-divider class="my-2"></v-divider>
            </v-col>
          </v-row>

          <v-card-item>
            <v-card-title class="text-h5 font-weight-bold text-blue-darken-2">
              <v-icon icon="mdi-cube-scan" size="28" class="mr-2"></v-icon>
              {{$t('toolsConvert.weTitle')}}
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              {{$t('toolsConvert.weDesc')}}
            </v-card-subtitle>
          </v-card-item>
          <v-expand-transition>
            <v-card v-if="showSubVersions3"
                    class="position-absolute w-100"
                    height="100%"
                    style="bottom: 0;"
                    hover>
              <v-card-title class="text-subtitle-1">
                <v-icon icon="mdi-history" class="mr-2"></v-icon>
                {{$t('toolsConvert.availableSubVersion')}}
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="6">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">{{$t('toolsConvert.extType')}}</span>
                        <span class="text-caption">schem</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.originSize')}}</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.We?.["0"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.subVersion')}}</span>
                        <span class="text-caption font-weight-medium">{{$t('toolsConvert.weSubVersion0')}}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{$t('toolsConvert.exist')}}</span>
                        <div>
                          <v-icon
                              :color="props.data?.schematics?.We?.['0'] == undefined? 'error' : 'success'"
                              size="16"
                              :icon="props.data?.schematics?.We?.['0'] == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                          >
                          </v-icon>
                        </div>
                      </div>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-col cols="12" class="justify-end">
                      <v-btn
                          variant="text"
                          color="info"
                          @click="openConversionDialog(3, 0)"
                      >
                        <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                        {{$t('toolsConvert.convertToThis')}}
                      </v-btn>
                    </v-col>
                  </v-col>
                  <v-col cols="6">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">{{ $t('toolsConvert.extType') }}:</span>
                        <span class="text-caption">schem</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.originSize') }}:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.We?.["1"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.subVersion') }}:</span>
                        <span class="text-caption font-weight-medium">{{$t('toolsConvert.weSubVersion1')}}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.exist') }}:</span>
                        <div>
                          <v-icon
                              :color="props.data?.schematics?.We?.['1'] == undefined? 'error' : 'success'"
                              size="16"
                              :icon="props.data?.schematics?.We?.['1'] == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                          >
                          </v-icon>
                        </div>
                      </div>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-col cols="12" class="justify-end">
                      <v-btn
                          variant="text"
                          color="info"
                          @click="openConversionDialog(3, 1)"
                      >
                        <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                        {{ $t('toolsConvert.convertToThis') }}
                      </v-btn>
                    </v-col>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-expand-transition>
        </v-card>
      </v-col>
      <v-col cols="6"
             @mouseenter="showSubVersions4 = true;"
             @mouseleave="showSubVersions4 = false"
      >
        <v-card class="format-card elevation-3" hover>
          <v-row no-gutters align="center">
            <v-col cols="4">
              <v-img
                  :src="bgImg"
                  height="120"
                  cover
                  class="card-image"
              ></v-img>
            </v-col>

            <v-col cols="8" class="pa-4">
              <div class="meta-info">
                <div class="d-flex justify-space-between">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.extType') }}:</span>
                  <span class="text-caption">json</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.gzipCompression') }}:</span>
                  <v-icon
                      color="error"
                      size="16"
                      icon="mdi-close-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.version') }}:</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-tag"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">v {{ props.data?.version }}</span>
                  </div>

                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.hasSubVersion') }}:</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-check-circle"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">3</span>
                  </div>
                </div>
              </div>
              <v-divider class="my-2"></v-divider>
            </v-col>
          </v-row>

          <v-card-item>
            <v-card-title class="text-h5 font-weight-bold text-blue-darken-2">
              <v-icon icon="mdi-cube-scan" size="28" class="mr-2"></v-icon>
              {{ $t('toolsConvert.bgTitle') }}
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              {{$t('toolsConvert.bgDesc')}}
            </v-card-subtitle>
          </v-card-item>
          <v-expand-transition>
            <v-card v-if="showSubVersions4"
                    class="position-absolute w-100"
                    height="100%"
                    style="bottom: 0;"
                    hover>
              <v-card-title class="text-subtitle-1">
                <v-icon icon="mdi-history" class="mr-2"></v-icon>
                {{ $t('toolsConvert.availableSubVersion') }}
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="4">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">{{ $t('toolsConvert.extType') }}:</span>
                        <span class="text-caption">json</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.originSize') }}:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Bg?.["0"]?.size || 0) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.hasSubVersion') }}:</span>
                        <span class="text-caption font-weight-medium">{{$t('toolsConvert.bgSubVersion0')}}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.exist') }}:</span>
                        <div>
                          <v-icon
                              :color="props.data?.schematics?.Bg?.['0'] == undefined? 'error' : 'success'"
                              size="16"
                              :icon="props.data?.schematics?.Bg?.['0'] == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                          >
                          </v-icon>
                        </div>
                      </div>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-col cols="12" class="justify-end">
                      <v-btn
                          variant="text"
                          color="info"
                          @click="openConversionDialog(4, 0)"
                      >
                        <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                        {{ $t('toolsConvert.convertToThis') }}
                      </v-btn>
                    </v-col>
                  </v-col>
                  <v-col cols="4">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">{{ $t('toolsConvert.extType') }}:</span>
                        <span class="text-caption">json</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.originSize') }}:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Bg?.['1']?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.subVersion') }}:</span>
                        <span class="text-caption font-weight-medium">{{$t('toolsConvert.bgSubVersion1')}}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.exist') }}:</span>
                        <div>
                          <v-icon
                              :color="props.data?.schematics?.Bg?.['1'] == undefined? 'error' : 'success'"
                              size="16"
                              :icon="props.data?.schematics?.Bg?.['1'] == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                          >
                          </v-icon>
                        </div>
                      </div>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-col cols="12" class="justify-end">
                      <v-btn
                          variant="text"
                          color="info"
                          @click="openConversionDialog(4, 1)"
                      >
                        <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                        {{ $t('toolsConvert.convertToThis') }}
                      </v-btn>
                    </v-col>
                  </v-col>
                  <v-col cols="4">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">{{ $t('toolsConvert.extType') }}:</span>
                        <span class="text-caption">json</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.originSize') }}:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Bg?.[2]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.subVersion') }}:</span>
                        <span class="text-caption font-weight-medium">{{$t('toolsConvert.bgSubVersion2')}}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.exist') }}:</span>
                        <div>
                          <v-icon
                              :color="props.data?.schematics?.Bg?.[2] == undefined? 'error' : 'success'"
                              size="16"
                              :icon="props.data?.schematics?.Bg?.[2] == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                          >
                          </v-icon>
                        </div>
                      </div>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-col cols="12" class="justify-end">
                      <v-btn
                          variant="text"
                          color="info"
                          @click="openConversionDialog(4, 2)"
                      >
                        <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                        {{ $t('toolsConvert.convertToThis') }}
                      </v-btn>
                    </v-col>
                  </v-col>

                </v-row>
              </v-card-text>
            </v-card>
          </v-expand-transition>
        </v-card>
      </v-col>
      <v-col cols="6"
             @mouseenter="showSubVersions5 = true;"
             @mouseleave="showSubVersions5 = false"
      >
        <v-card class="format-card elevation-3" hover>
          <v-row no-gutters align="center">
            <v-col cols="4">
              <v-img
                  :src="beImg"
                  height="120"
                  cover
                  class="card-image"
              ></v-img>
            </v-col>

            <v-col cols="8" class="pa-4">
              <div class="meta-info">
                <div class="d-flex justify-space-between">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.extType') }}:</span>
                  <span class="text-caption">mcstructure</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.gzipCompression') }}:</span>
                  <v-icon
                      color="error"
                      size="16"
                      icon="mdi-close-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.version') }}:</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-tag"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">v {{ props.data?.version }}</span>
                  </div>

                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">{{ $t('toolsConvert.existSubVersion') }}:</span>
                  <div>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-check-circle"
                    >
                    </v-icon>
                    <span class="text-caption font-weight-medium">1</span>
                  </div>
                </div>
              </div>
              <v-divider class="my-2"></v-divider>
            </v-col>
          </v-row>

          <v-card-item>
            <v-card-title class="text-h5 font-weight-bold text-blue-darken-2">
              <v-icon icon="mdi-cube-scan" size="28" class="mr-2"></v-icon>
              {{ $t('toolsConvert.beTitle') }}
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              {{ $t('toolsConvert.beDesc') }}
            </v-card-subtitle>
          </v-card-item>
          <v-expand-transition>
            <v-card v-if="showSubVersions5"
                    class="position-absolute w-100"
                    height="100%"
                    style="bottom: 0;"
                    hover>
              <v-card-title class="text-subtitle-1">
                <v-icon icon="mdi-history" class="mr-2"></v-icon>
                {{ $t('toolsConvert.availableSubVersion') }}
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="12">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">{{ $t('toolsConvert.extType') }}:</span>
                        <span class="text-caption">mcstructure</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.originSize') }}:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Be?.["-1"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.subVersion') }}:</span>
                        <span class="text-caption font-weight-medium">-1</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">{{ $t('toolsConvert.exist') }}:</span>
                        <div>
                          <v-icon
                              :color="props.data?.schematics?.Be == undefined? 'error' : 'success'"
                              size="16"
                              :icon="props.data?.schematics?.Be == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                          >
                          </v-icon>
                        </div>
                      </div>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-col cols="12" class="justify-end">
                      <v-btn
                          variant="text"
                          color="info"
                          @click="openConversionDialog(5)"
                      >
                        <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                        {{ $t('toolsConvert.convertToThis') }}
                      </v-btn>
                    </v-col>
                  </v-col>

                </v-row>
              </v-card-text>
            </v-card>
          </v-expand-transition>
        </v-card>
      </v-col>
        <v-col cols="6"
               @mouseenter="showSubVersions6 = true;"
               @mouseleave="showSubVersions6 = false"
        >
          <v-card class="format-card elevation-3" hover>
            <v-row no-gutters align="center">
              <v-col cols="4">
                <v-img
                    :src="weImg"
                    height="120"
                    cover
                    class="card-image"
                ></v-img>
              </v-col>

              <v-col cols="8" class="pa-4">
                <div class="meta-info">
                  <div class="d-flex justify-space-between">
                    <span class="text-caption text-grey">{{ $t('toolsConvert.extType') }}:</span>
                    <span class="text-caption">schematic</span>
                  </div>

                  <div class="d-flex justify-space-between mt-1">
                    <span class="text-caption text-grey">{{ $t('toolsConvert.gzipCompression') }}:</span>
                    <v-icon
                        color="success"
                        size="16"
                        icon="mdi-check-circle"
                    >
                    </v-icon>
                  </div>

                  <div class="d-flex justify-space-between mt-1">
                    <span class="text-caption text-grey">{{ $t('toolsConvert.version') }}:</span>
                    <div>
                      <v-icon
                          color="success"
                          size="16"
                          icon="mdi-tag"
                      >
                      </v-icon>
                      <span class="text-caption font-weight-medium">v {{ props.data?.version }}</span>
                    </div>
                  </div>

                  <div class="d-flex justify-space-between mt-1">
                    <span class="text-caption text-grey">{{ $t('toolsConvert.existSubVersion') }}:</span>
                    <div>
                      <v-icon
                          color="success"
                          size="16"
                          icon="mdi-check-circle"
                      >
                      </v-icon>
                      <span class="text-caption font-weight-medium">1</span>
                    </div>
                  </div>
                </div>
                <v-divider class="my-2"></v-divider>
              </v-col>
            </v-row>

            <v-card-item>
              <v-card-title class="text-h5 font-weight-bold text-blue-darken-2">
                <v-icon icon="mdi-cube-scan" size="28" class="mr-2"></v-icon>
                {{ $t('toolsConvert.mcEditTitle') }}
              </v-card-title>
              <v-card-subtitle class="text-caption text-grey-darken-1">
                {{ $t('toolsConvert.mcEditDesc') }}
              </v-card-subtitle>
            </v-card-item>
            <v-expand-transition>
              <v-card v-if="showSubVersions6"
                      class="position-absolute w-100"
                      height="100%"
                      style="bottom: 0;"
                      hover>
                <v-card-title class="text-subtitle-1">
                  <v-icon icon="mdi-history" class="mr-2"></v-icon>
                  {{ $t('toolsConvert.availableSubVersion') }}
                </v-card-title>
                <v-divider></v-divider>
                <v-card-text>
                  <v-row>
                    <v-col cols="12">
                      <div class="meta-info">
                        <div class="d-flex justify-space-between">
                          <span class="text-caption">{{ $t('toolsConvert.extType') }}:</span>
                          <span class="text-caption">schematic</span>
                        </div>

                        <div class="d-flex justify-space-between mt-1">
                          <span class="text-caption ">{{ $t('toolsConvert.originSize') }}:</span>
                          <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.McEdit?.["-1"]?.size || 0) / 1024).toFixed(2) + 'KB' }}</span>
                        </div>
                        <div class="d-flex justify-space-between mt-1">
                          <span class="text-caption ">{{ $t('toolsConvert.subVersion') }}:</span>
                          <span class="text-caption font-weight-medium">{{ legacyVersion }}</span>
                        </div>
                        <div class="d-flex justify-space-between mt-1">
                          <span class="text-caption ">{{ $t('toolsConvert.exist') }}:</span>
                          <div>
                            <v-icon
                                :color="props.data?.schematics?.McEdit == undefined? 'error' : 'success'"
                                size="16"
                                :icon="props.data?.schematics?.McEdit == undefined? 'mdi-close-circle' : 'mdi-check-circle'"
                            >
                            </v-icon>
                          </div>
                        </div>
                      </div>
                      <v-divider class="my-2"></v-divider>
                      <v-col cols="12" class="justify-end">
                        <v-btn
                            variant="text"
                            color="info"
                            :loading="isLoading"
                            @click="openConversionDialog(6)"
                        >
                          <v-icon icon="mdi-autorenew" class="mr-1"></v-icon>
                          {{ $t('toolsConvert.convertToThis') }}
                        </v-btn>
                      </v-col>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-expand-transition>
          </v-card>
        </v-col>
    </v-row>
  </v-container>
  <v-dialog
      v-model="dialogVersions1"
      max-width="500"
      persistent
  >
    <v-card
        max-width="500"
        width="500"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon icon="mdi-history" class="mr-2"></v-icon>
        {{ $t('toolsConvert.convertToTargetVersion') }}
        <v-chip
            v-if="props.data?.schematics?.Create != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          {{ $t('toolsConvert.exist') }}
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{ $t('toolsConvert.createDesc') }}
      </v-card-subtitle>
      <v-card-text>
        <v-select
            v-model="targetJavaVersions[targetVersionKey(1)]"
            :items="targetVersionOptions(1)"
            item-title="name"
            item-value="name"
            :label="$t('toolsConvert.javaTargetVersion')"
            density="compact"
            :loading="targetVersionLoadingByKey[targetVersionKey(1)]"
            :disabled="targetVersionIsDisabled(1)"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item
                v-bind="itemProps"
                :title="item.raw.name"
                :subtitle="`DataVersion ${item.raw.id}`"
            ></v-list-item>
          </template>
          <template #selection="{ item }">
            <span>{{ item.raw.name }} ({{ item.raw.id }})</span>
          </template>
        </v-select>
        <span class="text-caption text-grey-darken-1">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions1 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            :disabled="targetVersionIsDisabled(1)"
            @click="convertSchematic(1)"
        ></v-btn>
        <v-btn
            v-if="props.data?.schematics?.Create != undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, -1, props.data.version, 1, `create_${schematicData.name}`)"
        >
        </v-btn>
      </template>
    </v-card>
  </v-dialog>
  <v-dialog
      v-model="dialogVersions2"
      max-width="500"
      persistent
  >
    <v-card
        max-width="500"
        width="500"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon icon="mdi-history" class="mr-2"></v-icon>
        {{ $t('toolsConvert.convertToTargetVersion') }}
        <v-chip
            v-if="props.data?.schematics?.Litematic != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          {{ $t('toolsConvert.exist') }}
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{ $t('toolsConvert.litematicDesc') }}
      </v-card-subtitle>
      <v-card-text>
        <v-row no-gutters>
          <v-col cols="12">
            <v-select
                v-model="lmVersion"
                :items="litematicaOutputVersions"
                item-title="label"
                item-value="value"
                density="compact"
                :label="$t('toolsConvert.targetOutputVersion')"
            ></v-select>
          </v-col>
          <v-col cols="12">
            <v-select
                v-model="targetJavaVersions[targetVersionKey(2)]"
                :items="targetVersionOptions(2)"
                item-title="name"
                item-value="name"
                :label="$t('toolsConvert.javaTargetVersion')"
                density="compact"
                :loading="targetVersionLoadingByKey[targetVersionKey(2)]"
                :disabled="targetVersionIsDisabled(2)"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item
                    v-bind="itemProps"
                    :title="item.raw.name"
                    :subtitle="`DataVersion ${item.raw.id}`"
                ></v-list-item>
              </template>
              <template #selection="{ item }">
                <span>{{ item.raw.name }} ({{ item.raw.id }})</span>
              </template>
            </v-select>
          </v-col>
        </v-row>
        <span class="text-caption text-grey-darken-1">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions2 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            :disabled="targetVersionIsDisabled(2)"
            @click="convertSchematic(2)"
        ></v-btn>
        <v-btn
            v-if="props.data?.schematics?.Litematic != undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, -1, props.data.version, 2, `litematic_${schematicData.name}`)"
        >
        </v-btn>
      </template>
    </v-card>
  </v-dialog>
  <v-dialog
      v-model="dialogVersions3"
      max-width="500"
      persistent
  >
    <v-card
        max-width="500"
        width="500"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon icon="mdi-history" class="mr-2"></v-icon>
        {{ $t('toolsConvert.convertToTargetVersion') }}
        <v-chip
            v-if="props.data?.schematics?.We?.[weVersion] != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          {{ $t('toolsConvert.exist') }}
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{ $t('toolsConvert.weDesc') }}
      </v-card-subtitle>
      <v-card-text>
        <v-row no-gutters>
          <v-col cols="12">
            <v-select
                v-model="weVersion"
                :items="worldEditOutputVersions"
                item-title="label"
                item-value="value"
                :label="$t('toolsConvert.targetOutputVersion')"
                density="compact"
            ></v-select>
          </v-col>
          <v-col cols="12">
            <v-select
                v-model="targetJavaVersions[targetVersionKey(3, weVersion)]"
                :items="targetVersionOptions(3, weVersion)"
                item-title="name"
                item-value="name"
                :label="$t('toolsConvert.javaTargetVersion')"
                density="compact"
                :loading="targetVersionLoadingByKey[targetVersionKey(3, weVersion)]"
                :disabled="targetVersionIsDisabled(3, weVersion)"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item
                    v-bind="itemProps"
                    :title="item.raw.name"
                    :subtitle="`DataVersion ${item.raw.id}`"
                ></v-list-item>
              </template>
              <template #selection="{ item }">
                <span>{{ item.raw.name }} ({{ item.raw.id }})</span>
              </template>
            </v-select>
          </v-col>
        </v-row>
        <span class="text-caption text-grey-darken-1">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions3 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            :disabled="targetVersionIsDisabled(3, weVersion)"
            @click="convertSchematic(3)"
        ></v-btn>
        <v-btn
            v-if="props.data?.schematics?.We?.[weVersion] != undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, weVersion, props.data.version, 3, `we_${schematicData.name}`)"
        >
        </v-btn>
      </template>
    </v-card>
  </v-dialog>
  <v-dialog
      v-model="dialogVersions4"
      max-width="500"
      persistent
  >
    <v-card
        max-width="500"
        width="500"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon icon="mdi-history" class="mr-2"></v-icon>
        {{ $t('toolsConvert.convertToTargetVersion') }}
        <v-chip
            v-if="props.data?.schematics?.Bg?.[bgVersion] != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          {{ $t('toolsConvert.exist') }}
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{ $t('toolsConvert.bgDesc') }}
      </v-card-subtitle>
      <v-card-text>
        <v-row no-gutters>
          <v-col cols="12">
            <v-select
                v-model="bgVersion"
                :items="builderOutputVersions"
                item-title="label"
                item-value="value"
                :label="$t('toolsConvert.targetOutputVersion')"
                density="compact"
            ></v-select>
          </v-col>
          <v-col cols="12">
            <v-select
                v-model="targetJavaVersions[targetVersionKey(4, bgVersion)]"
                :items="targetVersionOptions(4, bgVersion)"
                item-title="name"
                item-value="name"
                :label="$t('toolsConvert.javaTargetVersion')"
                density="compact"
                :loading="targetVersionLoadingByKey[targetVersionKey(4, bgVersion)]"
                :disabled="targetVersionIsDisabled(4, bgVersion)"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item
                    v-bind="itemProps"
                    :title="item.raw.name"
                    :subtitle="`DataVersion ${item.raw.id}`"
                ></v-list-item>
              </template>
              <template #selection="{ item }">
                <span>{{ item.raw.name }} ({{ item.raw.id }})</span>
              </template>
            </v-select>
          </v-col>
        </v-row>
        <span class="text-caption text-grey-darken-1">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions4 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            :disabled="targetVersionIsDisabled(4, bgVersion)"
            @click="convertSchematic(4)"
        ></v-btn>
        <v-btn
            v-if="props.data?.schematics?.Bg?.[bgVersion] != undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, bgVersion, props.data.version, 4, `bg_${schematicData.name}`)"
        >
        </v-btn>
      </template>
    </v-card>
  </v-dialog>
  <v-dialog
      v-model="dialogVersions5"
      max-width="500"
      persistent
  >
    <v-card
        max-width="500"
        width="500"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon icon="mdi-history" class="mr-2"></v-icon>
        {{ $t('toolsConvert.convertToTargetVersion') }}
        <v-chip
            v-if="props.data?.schematics?.Be != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          {{ $t('toolsConvert.exist') }}
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{ $t('toolsConvert.beDesc') }}
      </v-card-subtitle>
      <v-card-text>
        <span class="text-caption text-grey-darken-1">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions5 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            v-if="props.data?.schematics?.Be == undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(5)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, -1, props.data.version, 5, `be_${schematicData.name}`)"
        >
        </v-btn>
      </template>
    </v-card>
  </v-dialog>
  <v-dialog
      v-model="dialogVersions6"
      max-width="500"
      persistent
  >
    <v-card
        max-width="500"
        width="500"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon icon="mdi-history" class="mr-2"></v-icon>
        {{ $t('toolsConvert.convertToTargetVersion') }}
        <v-chip
            v-if="props.data?.schematics?.McEdit != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          {{ $t('toolsConvert.exist') }}
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{ $t('toolsConvert.mcEditDesc') }}
      </v-card-subtitle>
      <v-card-text>
        <v-select
            v-model="legacyVersion"
            :items="legacyTargetVersions"
            item-title="name"
            item-value="name"
            :label="$t('toolsConvert.targetOutputVersion')"
            density="compact"
            :loading="legacyTargetVersionLoading"
            :disabled="legacyTargetVersionDisabled"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item
                v-bind="itemProps"
                :title="item.raw.name"
                :subtitle="`DataVersion ${item.raw.id}`"
            ></v-list-item>
          </template>
          <template #selection="{ item }">
            <span>{{ item.raw.name }} ({{ item.raw.id }})</span>
          </template>
        </v-select>
        <span class="text-caption text-grey-darken-1 d-block mt-3">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions6 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            :disabled="legacyTargetVersionDisabled"
            @click="convertSchematic(6)"
        ></v-btn>
        <v-btn
            v-if="props.data?.schematics?.McEdit != undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, -1, props.data.version, 6, `mcedit_${legacyVersion}_${schematicData.name}`)"
        ></v-btn>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.conversion-flow {
  min-height: 120px;
}

.format-card {
  border-radius: 12px;
  transition: transform 0.3s ease;
  overflow: hidden;
}

.format-card:hover {
  transform: translateY(-4px);
}

@media (max-width: 960px) {
  .conversion-flow {
    flex-direction: column;
  }

  .format-card {
    margin: 16px 0;
  }
}
</style>
