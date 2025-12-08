<script setup lang="ts">
import {defineProps, reactive, onMounted, watch, ref} from "vue";
import type { RequirementStatistics, RequirementStatistic } from "../../modules/requirements.ts";
import { jeBlocks, fetchJeBlocks, type SubData } from "../../modules/je_blocks.ts";
import {invoke} from "@tauri-apps/api/core";
import {getIconUrl, toast} from "../../modules/others.ts";
import {BlockData, BlockDataNew} from "../../modules/replace_data.ts";
import {schematic_id} from "../../modules/tools_data.ts";
import { useI18n } from 'vue-i18n';
const { t: $t } = useI18n();
const active = ref('brief')
const blockIdInput = ref('')
const propertiesInput = ref('')

const idRules = [
  (v: string) => !!v.trim() || $t('toolsReplace.idRequired'),
  (v: string) => /^[a-z0-9_]+:[a-z0-9_/]+$/i.test(v) || $t('toolsReplace.idFormat')
]

const propRules = [
  (v: string) => {
    if (!v) return true
    return v.split('\n').every(line => {
      const [key, value] = line.split('=')
      return key?.trim() && value?.trim()
    }) || $t('toolsReplace.propFormat')
  }
]

const parseProperties = (input: string): Record<string, string> => {
  return input.split('\n').reduce((acc, line) => {
    const [key, ...values] = line.split('=')
    if (key && values.length > 0) {
      acc[key.trim()] = values.join('=').trim()
    }
    return acc
  }, {} as Record<string, string>)
}

const updateBlockData = debounce(() => {

  try {
    if (!/^[a-z0-9_]+:[a-z0-9_/]+$/i.test(blockIdInput.value)) {
  throw new Error($t('toolsReplace.invalidIdFormat'))
    }
    state.selectedReplacementDetails = {
      id: blockIdInput.value,
      properties: parseProperties(propertiesInput.value)
    }
  } catch (err) {
    state.selectedReplacementDetails = null
  }
}, 300)

function debounce(fn: Function, delay: number) {
  let timeoutId: number
  return (...args: any[]) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(null, args), delay)
  }
}

interface ReplacementRule {
  replaceMode: number,
  original: RequirementStatistic;
  originalDetails: BlockData;
  replacement: SubData;
  replacementDetails: BlockData;
  quantity: number;
}
const props = defineProps<{
  data: RequirementStatistics | undefined;
  blocks: BlockData[] | undefined;
}>();

const state = reactive({
  selectedOriginal: null as RequirementStatistic | null,
  selectedOriginalDetails: null as BlockData | null,
  selectedReplacement: null as SubData | null,
  selectedReplacementDetails: null as BlockData | null,
  quantity: 1,
  globalReplace: true,
  replacementRules: [] as ReplacementRule[],
  isLoading: false,
  error: null as string | null,
  showConfirmDialog: false
});

onMounted(async () => {
  try {
    jeBlocks.value = await fetchJeBlocks();
  } catch (err) {
  state.error = err instanceof Error ? err.message : $t('toolsReplace.loadBlockError');
  }
});

const addReplacementRule = (mode: number) => {
  if (state.quantity <= 0) {
    state.error = $t('toolsReplace.quantityGreaterThanZero');
    return;
  }

  if (mode === 0) {
    if (!state.selectedOriginal || !state.selectedReplacement) {
      state.error = $t('toolsReplace.selectBlockAndTarget');
      return;
    }
  } else {
    if (!state.selectedOriginalDetails || !state.selectedReplacementDetails) {
      state.error = $t('toolsReplace.selectBlockAndTargetDetails');
      return;
    }
  }

  state.replacementRules.push({
    replaceMode: mode,
    original: state.selectedOriginal,
    replacement: state.selectedReplacement,
    quantity: state.quantity,
    originalDetails: state.selectedOriginalDetails,
    replacementDetails: state.selectedReplacementDetails
  });
  resetSelection();
};
const hasProperties = (block: BlockData): boolean => {
  return Object.keys(block.properties).length > 0
}

// 精准模式：只检索方块ID
const filterBlocksById = (_value: string, query: string, item?: any) => {
  if (!query) return true
  const search = query.toLowerCase()
  const block = item?.raw as BlockData
  if (!block) return false
  return block.id.toLowerCase().includes(search)
}

// 简单模式：同时检索中文名和ID
const filterBlocksByNameAndId = (_value: string, query: string, item?: any) => {
  if (!query) return true
  const search = query.toLowerCase()
  const block = item?.raw
  if (!block) return false
  
  const zhName = block.zh_cn || ''
  if (zhName.includes(search)) return true
  
  const blockId = block.id || ''
  if (blockId.toLowerCase().includes(search)) return true
  
  return false
}

const convertToNewBlockData = (oldData: any): BlockDataNew | null => {
  if (!oldData) return null;

  const idValue = typeof oldData.id === 'string' ?
      { name: oldData.id } :
      (oldData.id?.name ? oldData.id : null);

  if (!idValue) {
    console.error('Invalid block id format:', oldData.id);
    return null;
  }

  return {
    id: idValue,
    properties: oldData.properties || {}
  };
};


const executeReplacement = async () => {
  try {
    state.isLoading = true;
    state.error = null;
    let rules = state.replacementRules.map(r => ({
      schematic_id: schematic_id.value,
      mode: r.replaceMode,
      original_id: r.original?.id,
      replacement_id: typeof r.replacement === 'object'
          ? `minecraft:${r.replacement?.block_name}`
          : r.replacement,
      original_details: convertToNewBlockData(r.originalDetails),
      replacement_details: convertToNewBlockData(r.replacementDetails),
      quantity: r.quantity,
      global: state.globalReplace
    }))

    const result = await invoke<boolean>('schematic_replacement', {
      rules: rules
    });

    if (result) {
      state.replacementRules = [];
      state.showConfirmDialog = false;
    }
    toast.success($t('toolsReplace.replaceSuccess'), {
      timeout: 3000
    });
  } catch (err) {
    state.error = err instanceof Error ? err.message : $t('toolsReplace.replaceFailed');
    toast.error($t('toolsReplace.error', {error: String(err)}), {
      timeout: 3000
    });

  } finally {
    state.isLoading = false;
  }
};
const resetSelection = () => {
  state.selectedOriginal = null;
  state.selectedOriginalDetails = null;
  state.selectedReplacement = null;
  state.selectedOriginalDetails = null;
  state.quantity = 1;
  state.error = null;
  blockIdInput.value = '';
  propertiesInput.value = '';
};
const formatProperties = (props: Record<string, string>) => {
  return Object.entries(props)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
}

const removeRule = (index: number) => {
  state.replacementRules.splice(index, 1);
};
watch(() => [state.globalReplace, state.selectedOriginal], ([global, selected]) => {
  if (global && selected) {
    state.quantity = (selected as RequirementStatistic).num
  } else if (!global) {
    state.quantity = 1
  }
}, { deep: true })

watch(() => state.selectedOriginalDetails, (newVal) => {
  if (newVal && active.value === "details") {
    blockIdInput.value = newVal.id
    propertiesInput.value = Object.entries(newVal.properties)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    updateBlockData()
  }
}, { deep: true })

</script>

<template>

  <v-row class="pa-4" no-gutters>
    <v-col cols="4">
      <v-tabs v-model="active" align-tabs="center" color="blue-lighten-1">
  <v-tab value="brief">{{$t('toolsReplace.briefMode')}}</v-tab>
  <v-tab value="details">{{$t('toolsReplace.detailsMode')}}</v-tab>
      </v-tabs>
      <v-window v-model="active">
        <v-window-item value="brief">
          <div class="d-flex align-center mb-4">
            <v-icon icon="mdi-magnify" class="mr-2"/>
            <v-combobox
                v-model="state.selectedOriginal"
                :label="$t('toolsReplace.searchBlock')"
                :items="props.data?.items ?? []"
                item-title="zh_cn"
                item-value="id"
                clearable
                :loading="!props.data"
                :custom-filter="filterBlocksByNameAndId"
            >
              <template v-slot:selection="{ item }">
                <div class="d-flex align-center">
                  <v-avatar size="32" rounded="0" class="mr-2">
                    <img :src="getIconUrl(item.raw.id)" :alt="item.raw.id">
                  </v-avatar>
                  <div>
                    <span class="text-body-2">{{ item.raw.zh_cn }}</span>
                  </div>
                </div>
              </template>
              <template v-slot:item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps">
                  <template v-slot:prepend>
                    <v-avatar size="32" rounded="0" class="mr-2">
                      <img
                          :src="getIconUrl(item.raw.id)"
                          :alt="item.raw.zh_cn"
                      >
                    </v-avatar>
                  </template>
                  <v-list-item-subtitle class="text-caption">
                    {{$t('toolsReplace.id')}}: {{ item.raw.id }}
                  </v-list-item-subtitle>
                </v-list-item>
              </template>
            </v-combobox>
          </div>
          <div class="d-flex align-center">
            <v-icon icon="mdi-arrow-right" class="mx-2"/>
            <v-combobox
                v-model="state.selectedReplacement"
                :label="$t('toolsReplace.replaceTo')"
                :items="jeBlocks || []"
                item-title="zh_cn"
                item-value="block_name"
                :loading="!jeBlocks"
                clearable
            >
              <template v-slot:selection="{ item }">
                <div class="d-flex align-center">
                  <v-avatar size="32" rounded="0" class="mr-2">
                    <img :src="getIconUrl(`minecraft:${item.raw.block_name}`)" :alt="item.raw.zh_cn">
                  </v-avatar>
                  <div>
                    <span class="text-body-2">{{ item.raw.zh_cn }}</span>
                  </div>
                </div>
              </template>
              <template v-slot:item="{ props: itemProps, item }">
                <template v-if="typeof item.raw === 'object'">
                  <v-list-item v-bind="itemProps">
                    <template v-slot:prepend>
                      <v-avatar size="32" rounded="0" class="mr-2">
                        <img
                            :src="getIconUrl(`minecraft:${item.raw.block_name}`)"
                            :alt="item.raw.zh_cn"
                        >
                      </v-avatar>
                    </template>
                    <v-list-item-subtitle class="text-caption">
                      {{$t('toolsReplace.id')}}: minecraft:{{ item.raw.block_name }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </template>
                <template v-else>
                  <v-list-item v-bind="itemProps" :title="item.raw">
                    <template v-slot:prepend>
                      <v-avatar size="32" rounded="0" class="mr-2">
                        <img
                            :src="getIconUrl(item.raw)"
                            :alt="item.raw"
                            onerror="this.style.display='none'"
                        >
                      </v-avatar>
                    </template>
                    <v-list-item-subtitle class="text-caption">
                      {{$t('toolsReplace.customId')}}: {{ item.raw }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </template>
              </template>
            </v-combobox>
          </div>
          <v-text-field
              v-model.number="state.quantity"
              :label="$t('toolsReplace.replaceQuantity')"
              type="number"
              min="1"
              class="mt-4"
              :disabled="state.globalReplace && !!state.selectedOriginal"
          :hint="state.globalReplace
        ? (state.selectedOriginal
          ? $t('toolsReplace.globalReplaceLocked', {block: state.selectedOriginal.zh_cn, num: state.selectedOriginal.num})
          : $t('toolsReplace.selectBlockFirst'))
        : ''"
              persistent-hint
          />
          <v-checkbox
              v-model="state.globalReplace"
              :label="$t('toolsReplace.globalReplace')"
              density="compact"
              :disabled="true"
          />
          <v-btn
              block
              prepend-icon="mdi-playlist-plus"
              class="mb-2"
              color="secondary"
              @click="addReplacementRule(0)"
          >
            {{$t('toolsReplace.addToList')}}
          </v-btn>
          <v-btn
              color="green"
              block
              prepend-icon="mdi-swap-horizontal"
              :disabled="state.replacementRules.length === 0"
              @click="state.showConfirmDialog = true"
          >
            {{$t('toolsReplace.executeReplace')}}
          </v-btn>
        </v-window-item>
        <v-window-item value="details">
          <div class="d-flex align-center mb-4">
            <v-icon icon="mdi-magnify" class="mr-2"/>
            <v-combobox
                v-model="state.selectedOriginalDetails"
                :label="$t('toolsReplace.searchBlockWithProps')"
                :items="props.blocks ?? []"
                item-title="id"
                clearable
                :loading="!props.data"
                :custom-filter="filterBlocksById"
                :auto-filter-first="false"
            >
              <template v-slot:selection="{ item }">
                <div class="d-flex align-center">
                  <v-avatar size="32" rounded="0" class="mr-2">
                    <img :src="getIconUrl(item.raw.id)" :alt="item.raw.id">
                  </v-avatar>
                  <div>
                    <span class="text-body-2">{{ item.raw.id }}</span>

                  </div>
                </div>
              </template>

              <template v-slot:item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :title="undefined">
                  <template v-slot:prepend>
                    <v-avatar size="32" rounded="0" class="mr-2">
                      <img :src="getIconUrl(item.raw.id)" :alt="item.raw.id">
                    </v-avatar>
                  </template>
                  <v-list-item-title class="d-flex align-center">
                    <span class="text-body-2">{{ item.raw.id }}</span>
                    <v-chip
                        v-if="hasProperties(item.raw)"
                        size="small"
                        class="ml-2"
                        color="green"
                    >
                      {{ Object.keys(item.raw.properties).length }} 属性
                    </v-chip>
                  </v-list-item-title>
                  <v-list-item-subtitle v-if="hasProperties(item.raw)" class="text-caption">
                    {{ Object.entries(item.raw.properties).map(([k,v]) => `${k}=${v}`).join(', ') }}
                  </v-list-item-subtitle>
                </v-list-item>
              </template>
            </v-combobox>
          </div>
          <div class="d-flex align-center">
            <v-icon icon="mdi-arrow-right" class="mx-2"/>
            <v-row no-gutters>
              <v-col cols="12">
                <v-text-field
                    v-model="blockIdInput"
                    :label="$t('toolsReplace.blockIdLabel')"
                    :placeholder="$t('toolsReplace.blockIdPlaceholder')"
                    :rules="idRules"
                    @update:model-value="updateBlockData"
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                    v-model="propertiesInput"
                    :label="$t('toolsReplace.blockPropsLabel')"
                    :placeholder="$t('toolsReplace.blockPropsPlaceholder')"
                    rows="3"
                    :rules="propRules"
                    @update:model-value="updateBlockData"
                >
                  <template #append>
                    <v-tooltip :text="$t('toolsReplace.blockPropsTooltip')">
                      <template v-slot:activator="{ props }">
                        <v-icon v-bind="props" icon="mdi-information" size="small"/>
                      </template>
                    </v-tooltip>
                  </template>
                </v-textarea>
              </v-col>
              <v-col cols="12">
                <div v-if="state.selectedReplacementDetails" class="preview-box">
                  <div class="text-caption text-grey">{{$t('toolsReplace.preview')}}：</div>
                  <pre>{{ JSON.stringify(state.selectedReplacementDetails, null, 2) }}</pre>
                </div>
              </v-col>
            </v-row>
          </div>
          <v-checkbox
              v-model="state.globalReplace"
              label="全局替换"
              density="compact"
              :disabled="true"
          />
          <v-btn
              block
              prepend-icon="mdi-playlist-plus"
              class="mb-2"
              color="secondary"
              @click="addReplacementRule(1)"
          >
            添加列表
          </v-btn>
          <v-btn
              color="green"
              block
              prepend-icon="mdi-swap-horizontal"
              :disabled="state.replacementRules.length === 0"
              @click="state.showConfirmDialog = true"
          >
            执行替换
          </v-btn>
        </v-window-item>
      </v-window>

      <v-alert
          v-if="state.error"
          type="error"
          density="compact"
          class="mt-4"
      >
        {{ state.error }}
      </v-alert>
    </v-col>

    <v-col cols="8">
      <v-table density="compact" class="elevation-1">
        <thead>
        <tr>
          <th>{{$t('toolsReplace.mode')}}</th>
          <th>{{$t('toolsReplace.originalBlock')}}</th>
          <th>{{$t('toolsReplace.newBlock')}}</th>
          <th>{{$t('toolsReplace.quantity')}}</th>
          <th>{{$t('toolsReplace.action')}}</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(rule, index) in state.replacementRules" :key="index">
          <td>
            <v-chip :color="rule.replaceMode === 0 ? 'blue' : 'teal'" variant="tonal" size="small">
              {{ rule.replaceMode === 0 ? $t('toolsReplace.briefMode') : $t('toolsReplace.detailsMode') }}
            </v-chip>
          </td>

          <td>
            <template v-if="rule.replaceMode === 0">
              <div class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getIconUrl(rule.original.id)" :alt="rule.original.zh_cn">
                </v-avatar>
                {{ rule.original.zh_cn }}
              </div>
            </template>
            <template v-else>
              <div class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getIconUrl(rule.originalDetails.id)" :alt="rule.originalDetails.id">
                </v-avatar>
                <div>
                  <div>{{ rule.originalDetails.id }}</div>
                  <div v-if="Object.keys(rule.originalDetails.properties).length" class="text-caption text-grey">
                    {{ formatProperties(rule.originalDetails.properties) }}
                  </div>
                </div>
              </div>
            </template>
          </td>

          <td>
            <template v-if="rule.replaceMode === 0">
              <div v-if="typeof rule.replacement === 'object'" class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getIconUrl(`minecraft:${rule.replacement.block_name}`)" :alt="rule.replacement.zh_cn">
                </v-avatar>
                {{ rule.replacement.zh_cn }}
              </div>
              <div v-else class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getIconUrl(rule.replacement)" :alt="rule.replacement">
                </v-avatar>
                {{ rule.replacement }}
              </div>
            </template>
            <template v-else>
              <div class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getIconUrl(rule.replacementDetails.id)" :alt="rule.replacementDetails.id">
                </v-avatar>
                <div>
                  <div>{{ rule.replacementDetails.id }}</div>
                  <div v-if="Object.keys(rule.replacementDetails.properties).length" class="text-caption text-grey">
                    {{ formatProperties(rule.replacementDetails.properties) }}
                  </div>
                </div>
              </div>
            </template>
          </td>

          <td>
            <template v-if="rule.replaceMode === 0">
              {{ rule.quantity }}
            </template>
            <template v-else>
              {{$t('toolsReplace.defaultGlobal')}}
            </template>

          </td>
          <td>
      <v-btn
        variant="text"
        color="error"
        icon="mdi-delete"
        @click="removeRule(index)"
      >{{$t('toolsReplace.delete')}}</v-btn>
          </td>
        </tr>

        <tr v-if="state.replacementRules.length === 0">
          <td colspan="5" class="text-center text-grey">
            {{$t('toolsReplace.noRules')}}
          </td>
        </tr>
        </tbody>
      </v-table>
    </v-col>

    <v-dialog
        v-model="state.showConfirmDialog"
        max-width="500"
        persistent
    >
      <v-card>
        <v-card-title class="text-h6">
          <v-icon icon="mdi-alert" color="warning" class="mr-2"/>
          {{$t('toolsReplace.confirmReplace')}}
        </v-card-title>
        <v-card-subtitle>
          {{$t('toolsReplace.replaceExportHint')}}
        </v-card-subtitle>
        <v-card-text>
          {{$t('toolsReplace.replacePreview', {count: state.replacementRules.length})}}
          <ul class="mt-2">
            <li v-for="(rule, index) in state.replacementRules" :key="index">
              {{ rule.replaceMode == 0 ? rule.original.zh_cn :  rule.originalDetails.id}} → {{ rule.replaceMode == 0 ? rule.replacement.zh_cn : rule.replacementDetails.id }} ×{{ rule.replaceMode == 0 ? rule.quantity : $t('toolsReplace.defaultGlobal') }}
            </li>
          </ul>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="state.showConfirmDialog = false">{{$t('toolsReplace.cancel')}}</v-btn>
          <v-btn
              color="info"
              :loading="state.isLoading"
              @click="executeReplacement"
          >
            {{$t('toolsReplace.confirmExecute')}}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-row>
</template>

<style scoped>
ul {
  padding-left: 24px;
  list-style-type: circle;
}

</style>