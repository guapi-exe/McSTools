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
const props = defineProps<{
  data: ConvertData | undefined,
}>()
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
        title: '香草结构蓝图',
        desc: '适配 Minecraft 原版结构方块格式',
        icon: 'mdi-cube'
      }
    case 2:
      return {
        img: lmImg,
        ext: 'litematic',
        title: '投影蓝图',
        desc: '适配 我的世界建筑投影蓝图格式',
        icon: 'mdi-vector-square'
      }
    case 3:
      return {
        img: weImg,
        title: '创世神',
        ext: 'schem',
        desc: '适配与新版1.16 + 创世神模组和最新版 axios',
        icon: 'mdi-vector-square'
      }
    case 4:
      return {
        img: bgImg,
        title: '建筑小帮手',
        ext: 'json',
        desc: '适配与1.12 + 建筑小帮手 3个 变种格式蓝图',
        icon: 'mdi-vector-square'
      }
    case 5:
      return {
        img: beImg,
        title: 'MC BE',
        ext: 'mcstructure',
        desc: '适配与1.18 + 我的世界BE原版 结构方块格式',
        icon: 'mdi-vector-square'
      }
    default:
      return {
        img: beImg,
        title: '未知格式',
        ext: 'unknow',
        desc: '未知格式描述',
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
    toast.success(`转换完毕重新载入即可导出`, {
      timeout: 3000
    });
  } catch (err) {

    toast.error(`发生了一个错误:${err}`, {
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
        大型蓝图的转换耗时可能过长请耐心等待
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
                  <span class="text-caption text-grey">后缀类型:</span>
                  <span class="text-caption">{{ formatInfo.ext }}</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">原始大小:</span>
                  <span class="text-caption font-weight-medium">{{ ((Number(props.data?.size) ?? 0) / 1024).toFixed(2) + ' KB' }}</span>
                </div>
                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">版本:</span>
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
                  <span class="text-caption text-grey">适配子版本:</span>
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
        <div class=" text-blue-grey-darken-1 mt-6">一键转换</div>
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
                  <span class="text-caption text-grey">后缀类型:</span>
                  <span class="text-caption">litematic</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">Gzip压缩:</span>
                  <v-icon
                      color="success"
                      size="16"
                      icon="mdi-check-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">版本:</span>
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
                  <span class="text-caption text-grey">存在子版本:</span>
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
              投影蓝图
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              适配 我的世界建筑投影蓝图格式
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
                可用子版本
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="12">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">后缀类型:</span>
                        <span class="text-caption">litematic</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">原始大小:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Litematic?.["-1"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">子版本:</span>
                        <span class="text-caption font-weight-medium">-1</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">已存在:</span>
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
                        转换到该格式
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
                  <span class="text-caption text-grey">后缀类型:</span>
                  <span class="text-caption">nbt</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">Gzip压缩:</span>
                  <v-icon
                      color="success"
                      size="16"
                      icon="mdi-check-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">版本:</span>
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
                  <span class="text-caption text-grey">存在子版本:</span>
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
              香草结构
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              适配与JE原版结构方块和机械动力
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
                可用子版本
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="12">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">后缀类型:</span>
                        <span class="text-caption">nbt</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">原始大小:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Create?.["-1"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">子版本:</span>
                        <span class="text-caption font-weight-medium">-1</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">已存在:</span>
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
                        转换到该格式
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
                  <span class="text-caption text-grey">后缀类型:</span>
                  <span class="text-caption">schem</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">Gzip压缩:</span>
                  <v-icon
                      color="success"
                      size="16"
                      icon="mdi-check-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">版本:</span>
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
                  <span class="text-caption text-grey">存在子版本:</span>
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
              创世神
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              适配与新版1.16 + 创世神模组和最新版 axios
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
                可用子版本
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="6">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">后缀类型:</span>
                        <span class="text-caption">schem</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">原始大小:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.We?.["0"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">子版本:</span>
                        <span class="text-caption font-weight-medium">0: WE最新格式</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">已存在:</span>
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
                        转换到该格式
                      </v-btn>
                    </v-col>
                  </v-col>
                  <v-col cols="6">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">后缀类型:</span>
                        <span class="text-caption">schem</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">原始大小:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.We?.["1"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">子版本:</span>
                        <span class="text-caption font-weight-medium">1: WE 1.16-</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">已存在:</span>
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
                        转换到该格式
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
                  <span class="text-caption text-grey">后缀类型:</span>
                  <span class="text-caption">json</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">Gzip压缩:</span>
                  <v-icon
                      color="error"
                      size="16"
                      icon="mdi-close-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">版本:</span>
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
                  <span class="text-caption text-grey">存在子版本:</span>
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
              建筑小帮手
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              适配与1.12 + 建筑小帮手 3个 变种格式蓝图
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
                可用子版本
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="4">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">后缀类型:</span>
                        <span class="text-caption">json</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">原始大小:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Bg?.["0"]?.size || 0) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">子版本:</span>
                        <span class="text-caption font-weight-medium">0: 小帮手最新格式</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">已存在:</span>
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
                        转换到该格式
                      </v-btn>
                    </v-col>
                  </v-col>
                  <v-col cols="4">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">后缀类型:</span>
                        <span class="text-caption">json</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">原始大小:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Bg?.['1']?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">子版本:</span>
                        <span class="text-caption font-weight-medium">1: 小帮手1.16+</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">已存在:</span>
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
                        转换到该格式
                      </v-btn>
                    </v-col>
                  </v-col>
                  <v-col cols="4">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">后缀类型:</span>
                        <span class="text-caption">json</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">原始大小:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Bg?.[2]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">子版本:</span>
                        <span class="text-caption font-weight-medium">2: 小帮手1.12+</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">已存在:</span>
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
                        转换到该格式
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
                  <span class="text-caption text-grey">后缀类型:</span>
                  <span class="text-caption">mcstructure</span>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">Gzip压缩:</span>
                  <v-icon
                      color="error"
                      size="16"
                      icon="mdi-close-circle"
                  >
                  </v-icon>
                </div>

                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption text-grey">版本:</span>
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
                  <span class="text-caption text-grey">存在子版本:</span>
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
              MC BE
            </v-card-title>
            <v-card-subtitle class="text-caption text-grey-darken-1">
              适配与1.18 + 我的世界BE原版 结构方块格式
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
                可用子版本
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-row>
                  <v-col cols="12">
                    <div class="meta-info">
                      <div class="d-flex justify-space-between">
                        <span class="text-caption">后缀类型:</span>
                        <span class="text-caption">mcstructure</span>
                      </div>

                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">原始大小:</span>
                        <span class="text-caption font-weight-medium">{{ (Number(props.data?.schematics?.Be?.["-1"]?.size) / 1024).toFixed(2) + 'KB' }}</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">子版本:</span>
                        <span class="text-caption font-weight-medium">-1</span>
                      </div>
                      <div class="d-flex justify-space-between mt-1">
                        <span class="text-caption ">已存在:</span>
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
                        转换到该格式
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
        转换到目标版本
        <v-chip
            v-if="props.data?.schematics?.Create != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          已存在
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        转换到.nbt 香草结构蓝图.
      </v-card-subtitle>
      <v-card-text>
        <span class="text-caption text-grey-darken-1">
          无转换参数，大型蓝图转换需要一定时间等待
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions1 = false">取消</v-btn>
        <v-btn
            v-if="props.data?.schematics?.Create == undefined"
            class="ms-auto"
            text="确认开始"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(1)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            text="确认导出"
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
        转换到目标版本
        <v-chip
            v-if="props.data?.schematics?.Litematic != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          已存在
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        转换到.litematic 投影蓝图.
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
          大型蓝图转换需要一定时间等待
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions2 = false">取消</v-btn>
        <v-btn
            v-if="props.data?.schematics?.Litematic == undefined"
            class="ms-auto"
            text="确认开始"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(2)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            text="确认导出"
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
        转换到目标版本
        <v-chip
            v-if="props.data?.schematics?.We?.[weVersion] != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          已存在
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        转换到.schem 创世神蓝图.
      </v-card-subtitle>
      <v-card-text>
        <span class="text-caption text-grey-darken-1">
          无转换参数，大型蓝图转换需要一定时间等待
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions3 = false">取消</v-btn>
        <v-btn
            v-if="props.data?.schematics?.We?.[weVersion] == undefined"
            class="ms-auto"
            text="确认开始"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(3)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            text="确认导出"
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
        转换到目标版本
        <v-chip
            v-if="props.data?.schematics?.Bg?.[bgVersion] != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          已存在
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        转换到.json 建筑小帮手蓝图.
      </v-card-subtitle>
      <v-card-text>
        <span class="text-caption text-grey-darken-1">
          无转换参数，大型蓝图转换需要一定时间等待
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions4 = false">取消</v-btn>
        <v-btn
            v-if="props.data?.schematics?.Bg?.[bgVersion] == undefined"
            class="ms-auto"
            text="确认开始"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(4)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            text="确认导出"
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
        转换到目标版本
        <v-chip
            v-if="props.data?.schematics?.Be != undefined"
            color="green"
        >
          <v-icon start icon="mdi-check-circle"></v-icon>
          已存在
        </v-chip>
      </v-card-title>
      <v-card-subtitle class="text-caption text-grey-darken-1">
        转换到.mcstructure MC BE蓝图.
      </v-card-subtitle>
      <v-card-text>
        <span class="text-caption text-grey-darken-1">
          无转换参数，大型蓝图转换需要一定时间等待
        </span>
      </v-card-text>
      <template v-slot:actions>
        <v-spacer/>
        <v-btn @click="dialogVersions5 = false">取消</v-btn>
        <v-btn
            v-if="props.data?.schematics?.Be == undefined"
            class="ms-auto"
            text="确认开始"
            color="info"
            :loading="isLoading"
            @click="convertSchematic(5)"
        ></v-btn>
        <v-btn
            v-else
            class="ms-auto"
            text="确认导出"
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