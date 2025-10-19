<script setup lang="ts">
import bgImg from '../../static/img/bg.jpg'
import createImg from '../../static/img/create.jpg'
import lmImg from '../../static/img/Litematica.jpg'
import weImg from '../../static/img/wordEdit.png'
import beImg from '../../static/img/grass_block.png'
import {defineProps, computed, ref, onMounted} from "vue";
import {ConvertData, fetchConvertData} from "../../modules/convert_data.ts";
import {toast} from "../../modules/others.ts";
import {invoke} from "@tauri-apps/api/core";
import {convertData, schematic_id} from "../../modules/tools_data.ts";
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
const lmVersion = ref(6)
const weVersion = ref(0)
const bgVersion = ref(0)
const viAir = ref(false)
const dialogVersions5 = ref(false);
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
    console.log(lmVersion.value)
    const result = await invoke<boolean>('convert', {
      id: schematic_id.value,
      schematicType: schematicType,
      lmVersion: lmVersion.value,
      weVersion: weVersion.value,
      bgVersion: bgVersion.value,
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
onMounted(() => {
  console.log(props.data);
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
                          @click="dialogVersions2 = true;"
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
                          @click="dialogVersions1 = true"
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
                          @click="dialogVersions3 = true; weVersion = 0"
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
                          @click="dialogVersions3 = true; weVersion = 1"
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
                          @click="dialogVersions4 = true; bgVersion = 0"
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
                          @click="dialogVersions4 = true; bgVersion = 1"
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
                          @click="dialogVersions4 = true; bgVersion = 2"
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
                          @click="dialogVersions5 = true"
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
        <span class="text-caption text-grey-darken-1">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions1 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            v-if="props.data?.schematics?.Create == undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(1)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, -1, props.data.version, 1)"
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
            <v-combobox
                v-model="lmVersion"
                :items="[3, 4, 5, 6, 7]"
                density="compact"
                label="目标输出版本"
            ></v-combobox>
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
            v-if="props.data?.schematics?.Litematic == undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(2)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, -1, props.data.version, 2)"
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
        <span class="text-caption text-grey-darken-1">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions3 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            v-if="props.data?.schematics?.We?.[weVersion] == undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(3)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, weVersion, props.data.version, 3)"
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
        <span class="text-caption text-grey-darken-1">
          {{ $t('toolsConvert.longTimeTip') }}
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions4 = false">{{ $t('tools.convert.cancel') }}</v-btn>
        <v-btn
            v-if="props.data?.schematics?.Bg?.[bgVersion] == undefined"
            class="ms-auto"
            :text="$t('tools.convert.confirmStart')"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(4)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            :text="$t('tools.convert.confirmExport')"
            color="info"
            :loading="isLoading"
            @click="copySchematic(schematic_id, bgVersion, props.data.version, 4)"
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
            @click="copySchematic(schematic_id, -1, props.data.version, 5)"
        >
        </v-btn>
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