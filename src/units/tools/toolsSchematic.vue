<script setup lang="ts">
import {defineProps, onMounted, reactive, ref, watch} from "vue";
import {
  fetchSchematicGameVersions,
  GameVersionOption,
  SchematicsData,
  schematicTypeList,
} from "../../modules/schematics_data.ts";
import dayjs from "dayjs";
import {files, handleUpload, progressValue, uploadError, uploadStatus} from "../../modules/upload_schematic.ts";
import {
  update_schematic_game_version,
  update_schematic_name,
  update_user_classification,
} from "../../modules/update_schematic.ts";
import {fetch_data, schematic_id} from "../../modules/tools_data.ts";
import {toast} from "../../modules/others.ts";
import {userData} from "../../modules/user_data.ts";
import { useI18n } from 'vue-i18n';
const { t: $t } = useI18n();
import {invoke} from "@tauri-apps/api/core";

const props = defineProps<{
  data: SchematicsData | undefined,
}>()
const tags = ref<string[]>([])
const showLmVersionDialog = ref(false)
const showGameVersionDialog = ref(false)
const showBeClearAirDialog = ref(false)
const lastTags = ref<string[]>([]);
const editing = ref(false)
const lmVersion = ref(6)
const gameVersionOptions = ref<GameVersionOption[]>([])
const selectedGameVersion = ref<GameVersionOption | null>(null)
const gameVersionLoading = ref(false)
const editLoading = ref(false)
const checkingBeAir = ref(false)
const beAirActionLoading = ref(false)
const hasBeAirBlocks = ref(false)
const parseDimensions = (sizeStr: string) => {
  const [length, width, height] = sizeStr.split(',').map(Number);
  return [`X${length}`, `Y${width}`, `Z${height}`]
};
const supportsGameVersion = (schematicType: number) => [1, 2, 3, 6].includes(schematicType)
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
  if (!props.data) return;
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
  showLmVersionDialog.value = false;
}

const loadGameVersionOptions = async () => {
  if (!props.data || !supportsGameVersion(props.data.schematic_type)) {
    gameVersionOptions.value = []
    selectedGameVersion.value = null
    return
  }

  try {
    gameVersionLoading.value = true
    gameVersionOptions.value = await fetchSchematicGameVersions(
      props.data.schematic_type,
      props.data.sub_type,
    )
    selectedGameVersion.value =
      gameVersionOptions.value.find(option => option.name === props.data?.game_version) ??
      gameVersionOptions.value[gameVersionOptions.value.length - 1] ??
      null
  } catch (error) {
    gameVersionOptions.value = []
    selectedGameVersion.value = null
    console.warn('Unable to load game version options', error)
  } finally {
    gameVersionLoading.value = false
  }
}

const setGameVersion = async () => {
  if (!props.data || !selectedGameVersion.value) return

  try {
    gameVersionLoading.value = true
    const result = await update_schematic_game_version(
      props.data.id,
      selectedGameVersion.value.name,
    )
    if (result) {
      props.data.game_version = selectedGameVersion.value.name
      showGameVersionDialog.value = false
      toast.success($t('toolsSchematic.gameVersionUpdated'), {
        timeout: 3000,
      })
    }
  } catch (error) {
    toast.error(`发生了一个错误:${error}`, { timeout: 3000 })
  } finally {
    gameVersionLoading.value = false
  }
}

const loadBeAirState = async () => {
  if (!props.data || props.data.schematic_type !== 5) {
    hasBeAirBlocks.value = false
    return
  }

  try {
    checkingBeAir.value = true
    hasBeAirBlocks.value = await invoke<boolean>('be_has_air', {
      id: props.data.id,
    })
  } catch (error) {
    hasBeAirBlocks.value = false
    toast.error(`发生了一个错误:${error}`, { timeout: 3000 })
  } finally {
    checkingBeAir.value = false
  }
}

const clearBeAirBlocks = async () => {
  if (!props.data) return

  try {
    beAirActionLoading.value = true
    const result = await invoke<boolean>('be_clear_air', {
      id: props.data.id,
    })
    if (result) {
      hasBeAirBlocks.value = false
      showBeClearAirDialog.value = false
      await fetch_data(props.data.id)
      toast.success($t('toolsSchematic.clearAirBlocksSuccess'), {
        timeout: 3000,
      })
    }
  } catch (error) {
    toast.error(`发生了一个错误:${error}`, { timeout: 3000 })
  } finally {
    beAirActionLoading.value = false
  }
}

watch(
  () => [props.data?.id, props.data?.schematic_type, props.data?.sub_type],
  async () => {
    if (props.data) {
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

    await loadGameVersionOptions()
    await loadBeAirState()
  },
  { immediate: true }
)

onMounted(() => {
  const classification = userData.value?.classification
  if (typeof classification === 'string') {
    tags.value = classification
        ? classification.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
        : [];
    lastTags.value = tags.value
  } else {
    tags.value = [];
  }
});

</script>

<template>
  <div v-if="props.data" class="ma-4">
  <v-card-title>{{$t('toolsSchematic.basicInfo')}}</v-card-title>

    <v-card-text>
      <v-row>
        <v-col cols="6">
          <v-list density="compact">
            <v-list-item>
              <template v-slot:prepend>
                <v-icon icon="mdi-identifier"></v-icon>
              </template>
              <v-list-item-title>{{$t('toolsSchematic.id')}}：{{ props.data.id }}</v-list-item-title>
            </v-list-item>

            <v-list-item  v-if="!editing">
              <v-list-item-title class="d-flex align-center">
                <span>{{$t('toolsSchematic.name')}}：{{ props.data.name }}</span>
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
          :label="$t('toolsSchematic.name')"
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
              <v-list-item-title>{{$t('toolsSchematic.type')}}：{{ schematicTypeList[props.data.schematic_type as 1 | 2 | 3 | 4 | 5 | 6] }} </v-list-item-title>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>
                {{$t('toolsSchematic.size')}}：
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
                <span>{{$t('toolsSchematic.lmVersion')}}：{{ props.data.lm_version }}</span>
              </v-list-item-title>
              <template v-slot:append>

                <v-list-item-action class="ml-2">
                  <v-btn
                      variant="text"
                      size="x-small"
                      icon="mdi-pencil"
                      @click="showLmVersionDialog = true;"
                  ></v-btn>
                </v-list-item-action>
              </template>
            </v-list-item>
            <v-list-item v-if="supportsGameVersion(props.data.schematic_type)">
              <v-list-item-title class="d-flex align-center">
                <span>{{$t('toolsSchematic.gameVersion')}}：{{ props.data.game_version || $t('toolsSchematic.unknown') }}</span>
              </v-list-item-title>
              <template v-slot:append>
                <v-list-item-action class="ml-2">
                  <v-btn
                      variant="text"
                      size="x-small"
                      icon="mdi-pencil"
                      :loading="gameVersionLoading"
                      :disabled="gameVersionOptions.length === 0"
                      @click="showGameVersionDialog = true"
                  ></v-btn>
                </v-list-item-action>
              </template>
            </v-list-item>
            <v-list-item v-if="props.data.schematic_type == 5 && hasBeAirBlocks">
              <v-list-item-title class="d-flex align-center">
                <span>{{$t('toolsSchematic.airBlocks')}}：{{$t('toolsSchematic.clearable')}}</span>
              </v-list-item-title>
              <template v-slot:append>
                <v-list-item-action class="ml-2">
                  <v-btn
                      variant="text"
                      size="x-small"
                      icon="mdi-air-filter"
                      :loading="beAirActionLoading || checkingBeAir"
                      @click="showBeClearAirDialog = true"
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
                {{$t('toolsSchematic.status')}}：
                <v-chip :color="props.data.is_deleted ? 'error' : 'success'" size="small">
                  {{ props.data.is_deleted ? $t('toolsSchematic.deleted') : $t('toolsSchematic.normal') }}
                </v-chip>
              </v-list-item-title>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>{{$t('toolsSchematic.creator')}}：{{ props.data.user || $t('toolsSchematic.unknown') }}</v-list-item-title>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>{{$t('toolsSchematic.version')}}：v{{ props.data.version }}
              </v-list-item-title>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>{{$t('toolsSchematic.updatedAt')}}：{{ formatTime(props.data.updated_at) }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-col>
        <v-col cols="12">
      <v-combobox
        v-model="schematicEdit.schematic_tags"
        :label="$t('toolsSchematic.tags')"
        multiple
        chips
        clearable
        variant="underlined"
        :hint="$t('toolsSchematic.tagsHint')"
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
      :label="$t('toolsSchematic.description')"
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
      :label="$t('toolsSchematic.updateFile')"
      multiple
      accept=".nbt, .json, .schem, .schematic, .litematic, .mcstructure"
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
            <span class="mr-2">{{$t('toolsSchematic.uploadSuccess', {count: files.length})}}</span>
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
            <span class="mr-2">{{$t('toolsSchematic.uploadError')}}:{{ uploadError }}</span>
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
  {{$t('toolsSchematic.noSchematic')}}
    </v-alert>
  </div>

  <v-dialog v-model="showLmVersionDialog" max-width="600" persistent>
    <v-card
        class="v-theme--custom"
    >
      <v-card-title class="headline">
        <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
  {{$t('toolsSchematic.editLmVersion')}}
      </v-card-title>

      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{$t('toolsSchematic.editLmVersionHint')}}
      </v-card-subtitle>
      <v-card-text>
        <v-row no-gutters>
          <v-col cols="12">
            <v-combobox
                v-model="lmVersion"
                :items="[3, 4, 5, 6, 7]"
                density="compact"
                :label="$t('toolsSchematic.targetVersion')"
            ></v-combobox>
          </v-col>
        </v-row>
        <span class="text-caption text-grey-darken-1">
          {{$t('toolsSchematic.confirmTargetVersion')}}
        </span>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            color="grey-darken-1"
            @click="showLmVersionDialog = false"
        >
          {{$t('toolsSchematic.cancel')}}
        </v-btn>
        <v-btn
            color="info"
            @click="setLmVersion"
        >
          {{$t('toolsSchematic.confirmEdit')}}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showGameVersionDialog" max-width="600" persistent>
    <v-card
        class="v-theme--custom"
    >
      <v-card-title class="headline">
        <v-icon color="info" class="mr-2">mdi-cube-outline</v-icon>
        {{$t('toolsSchematic.editGameVersion')}}
      </v-card-title>

      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{$t('toolsSchematic.editGameVersionHint')}}
      </v-card-subtitle>
      <v-card-text>
        <v-select
            v-model="selectedGameVersion"
            :items="gameVersionOptions"
            item-title="name"
            return-object
            density="compact"
            :label="$t('toolsSchematic.targetVersion')"
            :loading="gameVersionLoading"
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
          {{$t('toolsSchematic.confirmGameVersion')}}
        </span>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            color="grey-darken-1"
            @click="showGameVersionDialog = false"
        >
          {{$t('toolsSchematic.cancel')}}
        </v-btn>
        <v-btn
            color="info"
            :loading="gameVersionLoading"
            :disabled="!selectedGameVersion"
            @click="setGameVersion"
        >
          {{$t('toolsSchematic.confirmEdit')}}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showBeClearAirDialog" max-width="600" persistent>
    <v-card
        class="v-theme--custom"
    >
      <v-card-title class="headline">
        <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
        {{$t('toolsSchematic.clearAirBlocks')}}
      </v-card-title>

      <v-card-subtitle class="text-caption text-grey-darken-1">
        {{$t('toolsSchematic.clearAirBlocksHint')}}
      </v-card-subtitle>
      <v-card-text>
        <span class="text-caption text-grey-darken-1">
          {{$t('toolsSchematic.confirmClearAirBlocks')}}
        </span>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            color="grey-darken-1"
            @click="showBeClearAirDialog = false"
        >
          {{$t('toolsSchematic.cancel')}}
        </v-btn>
        <v-btn
            color="info"
            :loading="beAirActionLoading"
            @click="clearBeAirBlocks"
        >
          {{$t('toolsSchematic.confirmEdit')}}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>

</style>
