<script setup lang="ts">
import {defineProps, onMounted, reactive, ref} from "vue";
import {SchematicsData, schematicTypeList} from "../../modules/schematics_data.ts";
import dayjs from "dayjs";
import {files, handleUpload, progressValue, uploadError, uploadStatus} from "../../modules/upload_schematic.ts";
import {update_schematic_name, update_user_classification} from "../../modules/update_schematic.ts";
import {schematic_id} from "../../modules/tools_data.ts";
import {toast} from "../../modules/others.ts";
import {userData} from "../../modules/user_data.ts";
import {opacity} from "../../modules/theme.ts";
import {invoke} from "@tauri-apps/api/core";

const props = defineProps<{
  data: SchematicsData | undefined,
}>()
const tags = ref<string[]>([])
const showDeleteDialog = ref(false)
const lastTags = ref<string[]>([]);
const editing = ref(false)
const lmVersion = ref(6)
const editLoading = ref(false)
const parseDimensions = (sizeStr: string) => {
  const [length, width, height] = sizeStr.split(',').map(Number);
  return [`X${length}`, `Y${width}`, `Z${height}`]
};
const schematicEdit = reactive({
  name: '',
  schematic_tags: [] as string[],
  description: ''
})
const formatTime = (time: any) => {
  return dayjs(time).format('YYYY/MM/DD HH:mm')
}
const saveEdit = async (newTags: string[]) => {
  editing.value = false
  editLoading.value = true

  try {
    const tagsString = schematicEdit.schematic_tags.join(',');
    let result = await update_schematic_name(
        schematic_id.value,
        schematicEdit.name,
        tagsString,
        schematicEdit.description
    );
    if (result){
      toast.success(`数据已更新`, { timeout: 3000 });
      props.data.name = schematicEdit.name
      props.data.schematic_tags = tagsString;
      props.data.description = schematicEdit.description
    }
  } catch (e) {
    console.log(e)
  } finally {
    editing.value = false
  }
  lastTags.value = [...newTags];
}
const saveTags = async (newTags: string[]) => {
  const added = newTags.filter(tag => !lastTags.value.includes(tag));
  try {
    tags.value.push(...added);
    const tagsString = schematicEdit.schematic_tags.join(',');
    const allTagsString = tags.value.join(',');
    let result = await update_schematic_name(
        schematic_id.value,
        schematicEdit.name,
        tagsString,
        schematicEdit.description
    );
    if (!tags.value.includes(added[0])) {
      await update_user_classification(
          allTagsString
      );
    }

    if (result){
      toast.success(`数据已更新`, { timeout: 3000 });
      props.data.name = schematicEdit.name
      props.data.schematic_tags = tagsString;
      props.data.description = schematicEdit.description
    }
  } catch (e) {
    console.log(e)
  } finally {
    editing.value = false
  }
  lastTags.value = [...newTags];
}


const setLmVersion = async () => {
  props.data.lm_version = lmVersion.value;
  const result = await invoke<boolean>('convert_lm', {
    id: schematic_id.value,
    lmVersion: lmVersion.value,
  });
  if (result) {
    toast.success(`版本修改完毕`, {
      timeout: 3000
    });
  }
  showDeleteDialog.value = false;
}

onMounted(() => {
  if(props.data){
    schematicEdit.name = props.data.name;

    if ((props.data.schematic_tags && typeof props.data.schematic_tags === 'string') && props.data.schematic_tags != "{}") {
      schematicEdit.schematic_tags = props.data.schematic_tags
          ? props.data.schematic_tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
          : [];
    } else {
      schematicEdit.schematic_tags = [];
    }

    schematicEdit.description = props.data.description;

    lmVersion.value = props.data.lm_version;
  }
  if ((userData.value.classification && typeof userData.value.classification === 'string') && userData.value.classification.length >= 0) {
    tags.value = userData.value.classification
        ? userData.value.classification.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
        : [];
    lastTags.value = tags.value
  } else {
    tags.value = [];
  }
});

</script>

<template>
  <div v-if="props.data" class="ma-4">
    <v-card-title>蓝图基本信息</v-card-title>

    <v-card-text>
      <v-row>
        <v-col cols="6">
          <v-list density="compact">
            <v-list-item>
              <template v-slot:prepend>
                <v-icon icon="mdi-identifier"></v-icon>
              </template>
              <v-list-item-title>ID：{{ props.data.id }}</v-list-item-title>
            </v-list-item>

            <v-list-item  v-if="!editing">
              <v-list-item-title class="d-flex align-center">
                <span>名称：{{ props.data.name }}</span>
              </v-list-item-title>
              <template v-slot:append>

                <v-list-item-action class="ml-2">
                  <v-btn
                      variant="text"
                      size="x-small"
                      icon="mdi-pencil"
                      @click="editing = true"
                  ></v-btn>
                </v-list-item-action>
              </template>
            </v-list-item>
            <v-list-item v-else>
              <v-text-field
                  v-model="schematicEdit.name"
                  variant="underlined"
                  density="compact"
                  autofocus
                  @keydown.enter="saveEdit"
              ></v-text-field>
              <template v-slot:append>

                <v-list-item-action class="d-flex gap-2">
                  <v-btn
                      variant="text"
                      size="x-small"
                      icon="mdi-check"
                      color="success"
                      @click="saveEdit"
                  ></v-btn>
                </v-list-item-action>
              </template>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>类型：{{ schematicTypeList[props.data.schematic_type as 1 | 2 | 3 | 4] }} </v-list-item-title>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>
                尺寸：
                <v-chip
                    color="deep-purple"
                    variant="outlined"
                    size="small"
                    class="dimension-chip"
                >
                  <div class="d-flex align-center">
                    <v-icon icon="mdi-axis-arrow" class="mr-1"></v-icon>
                    <div class="dimension-values">
                                <span v-for="(dim, index) in parseDimensions(props.data.sizes)" :key="index">
                                  {{ dim }}
                                  <v-icon v-if="index < 2" icon="mdi-close" size="x-small" class="mx-1"></v-icon>
                                </span>
                    </div>
                  </div>
                </v-chip>
              </v-list-item-title>
            </v-list-item>
            <v-list-item v-if="props.data.schematic_type == 2">
              <v-list-item-title class="d-flex align-center">
                <span>投影格式版本：{{ props.data.lm_version }}</span>
              </v-list-item-title>
              <template v-slot:append>

                <v-list-item-action class="ml-2">
                  <v-btn
                      variant="text"
                      size="x-small"
                      icon="mdi-pencil"
                      @click="showDeleteDialog = true;"
                  ></v-btn>
                </v-list-item-action>
              </template>
            </v-list-item>
          </v-list>
        </v-col>

        <v-col cols="6">
          <v-list density="compact">
            <v-list-item>
              <v-list-item-title>
                状态：
                <v-chip :color="props.data.is_deleted ? 'error' : 'success'" size="small">
                  {{ props.data.is_deleted ? '已删除' : '正常' }}
                </v-chip>
              </v-list-item-title>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>创建者：{{ props.data.user || '未知' }}</v-list-item-title>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>版本：v{{ props.data.version }}
                <v-chip
                    color="orange-lighten-4"
                    size="small"
                    class="text-orange-darken-4"
                >
                  <v-icon start icon="mdi-cube"></v-icon>
                  {{ props.data.game_version }}
                </v-chip>
              </v-list-item-title>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>更新时间：{{ formatTime(props.data.updated_at) }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-col>
        <v-col cols="12">
          <v-combobox
              v-model="schematicEdit.schematic_tags"
              label="蓝图标签"
              multiple
              chips
              clearable
              variant="underlined"
              hint="输入后按回车添加标签"
              persistent-hint
              :items="[]"
              @update:model-value="saveTags"
          >
            <template v-slot:chip="{ props, item, index }">
              <v-chip
                  v-bind="props"
                  color="info"
                  size="small"
                  class="ma-1"
                  closable
                  @click:close="schematicEdit.schematic_tags.splice(index, 1)"
              >
                <v-icon size="16">mdi-tag</v-icon>
                {{ item.title }}
              </v-chip>
            </template>
          </v-combobox>
        </v-col>
      </v-row>

      <v-textarea
          :readonly="!editing"
          :model-value="schematicEdit.description"
          label="蓝图描述"
          clearable
          auto-grow
          @keydown.enter="saveEdit"
          class="mt-4"
      ></v-textarea>

      <div class="upload-container">
        <v-file-input
            v-model="files"
            class="custom-file-input"
            variant="solo-filled"
            color="info"
            bg-color="grey-lighten-3"
            label="更新蓝图文件"
            multiple
            accept=".nbt, .json, .schem, .litematic, .mcstructure"
            :max-file-size="100 * 1024 * 1024"
            :loading="uploadStatus === 'uploading'"
            :error-messages="uploadError"
            :disabled="uploadStatus === 'uploading'"
            @update:model-value="handleUpload(props.data.id)"
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
            <span class="mr-2">成功上传 {{ files.length }} 个文件</span>
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
            <span class="mr-2">发生错误:{{ uploadError }}</span>
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
  </div>
  <div v-else class="ma-4 error-card">
    <v-alert type="error">
      未选取蓝图
    </v-alert>
  </div>

  <v-dialog v-model="showDeleteDialog" max-width="600" persistent>
    <v-card
        class="v-theme--custom"
        :style="{ '--surface-alpha': opacity }"
    >
      <v-card-title class="headline">
        <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
        修改投影版本
      </v-card-title>

      <v-card-subtitle class="text-caption text-grey-darken-1">
        修改建筑投影，自身版本控制器
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
          修改前确认你想要的目标版本
        </span>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            color="grey-darken-1"
            @click="showDeleteDialog = false"
        >
          取消
        </v-btn>
        <v-btn
            color="info"
            @click="setLmVersion"
        >
          确认修改
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>

</style>