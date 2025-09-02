<script setup lang="ts">
import {defineProps, reactive, onMounted, watch, ref} from "vue";
import type { RequirementStatistics, RequirementStatistic } from "../../modules/requirements.ts";
import { jeBlocks, fetchJeBlocks, type SubData } from "../../modules/je_blocks.ts";
import {invoke} from "@tauri-apps/api/core";
import {getBlockIcon, toast} from "../../modules/others.ts";
import {BlockData, BlockDataNew} from "../../modules/replace_data.ts";
import {schematic_id} from "../../modules/tools_data.ts";
const active = ref(0)
const blockIdInput = ref('')
const propertiesInput = ref('')

const idRules = [
  (v: string) => !!v.trim() || '必须输入方块ID',
  (v: string) => /^[a-z0-9_]+:[a-z0-9_/]+$/i.test(v) || '格式: 命名空间:方块名'
]

const propRules = [
  (v: string) => {
    if (!v) return true
    return v.split('\n').every(line => {
      const [key, value] = line.split('=')
      return key?.trim() && value?.trim()
    }) || '每行格式应为 键=值'
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
      throw new Error('无效的方块ID格式')
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
    state.error = err instanceof Error ? err.message : '无法加载方块数据';
  }
});

const addReplacementRule = (mode: number) => {
  if (state.quantity <= 0) {
    state.error = '替换数量必须大于0';
    return;
  }

  if (mode === 0) {
    if (!state.selectedOriginal || !state.selectedReplacement) {
      state.error = '请先选择要替换的方块和替换目标';
      return;
    }
  } else {
    if (!state.selectedOriginalDetails || !state.selectedReplacementDetails) {
      state.error = '请先选择要替换的方块和替换目标（精准模式）';
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
const filterBlocks = (item: BlockData, queryText: string) => {
  const search = queryText.toLowerCase()

  if (item.id.toLowerCase().includes(search)) return true

  return Object.entries(item.properties).some(([key, value]) => {
    return `${key}=${value}`.toLowerCase().includes(search)
  })
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
    toast.success(`方块替换完成,请前往仓库中查看`, {
      timeout: 3000
    });
  } catch (err) {
    state.error = err instanceof Error ? err.message : '替换操作失败';
    toast.error(`发生了一个错误:${err}`, {
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

</script>

<template>

  <v-row class="pa-4" no-gutters>
    <v-col cols="4">
      <v-tabs v-model="active" align-tabs="center" color="blue-lighten-1">
        <v-tab value="brief">简单模式</v-tab>
        <v-tab value="details">精准模式</v-tab>
      </v-tabs>
      <v-window v-model="active">
        <v-window-item value="brief">
          <div class="d-flex align-center mb-4">
            <v-icon icon="mdi-magnify" class="mr-2"/>
            <v-combobox
                v-model="state.selectedOriginal"
                label="查找方块"
                :items="props.data?.items ?? []"
                item-title="zh_cn"
                item-value="id"
                clearable
                :loading="!props.data"
            >
              <template v-slot:selection="{ item }">
                <div class="d-flex align-center">
                  <v-avatar size="32" rounded="0" class="mr-2">
                    <img :src="getBlockIcon(item.raw.id)" :alt="item.raw.id">
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
                          :src="getBlockIcon(item.raw.id)"
                          :alt="item.raw.zh_cn"
                      >
                    </v-avatar>
                  </template>
                  <v-list-item-subtitle class="text-caption">
                    ID: {{ item.raw.id }}
                  </v-list-item-subtitle>
                </v-list-item>
              </template>
            </v-combobox>
          </div>
          <div class="d-flex align-center">
            <v-icon icon="mdi-arrow-right" class="mx-2"/>
            <v-combobox
                v-model="state.selectedReplacement"
                label="替换为（可输入ID或选择）"
                :items="jeBlocks || []"
                item-title="zh_cn"
                item-value="block_name"
                :loading="!jeBlocks"
                clearable
            >
              <template v-slot:selection="{ item }">
                <div class="d-flex align-center">
                  <v-avatar size="32" rounded="0" class="mr-2">
                    <img :src="getBlockIcon(`minecraft:${item.raw.block_name}`)" :alt="item.raw.zh_cn">
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
                            :src="getBlockIcon(`minecraft:${item.raw.block_name}`)"
                            :alt="item.raw.zh_cn"
                        >
                      </v-avatar>
                    </template>
                    <v-list-item-subtitle class="text-caption">
                      ID: minecraft:{{ item.raw.block_name }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </template>
                <template v-else>
                  <v-list-item v-bind="itemProps" :title="item.raw">
                    <template v-slot:prepend>
                      <v-avatar size="32" rounded="0" class="mr-2">
                        <img
                            :src="getBlockIcon(item.raw)"
                            :alt="item.raw"
                            onerror="this.style.display='none'"
                        >
                      </v-avatar>
                    </template>
                    <v-list-item-subtitle class="text-caption">
                      自定义ID: {{ item.raw }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </template>
              </template>
            </v-combobox>
          </div>
          <v-text-field
              v-model.number="state.quantity"
              label="替换数量"
              type="number"
              min="1"
              class="mt-4"
              :disabled="state.globalReplace && !!state.selectedOriginal"
              :hint="state.globalReplace
      ? (state.selectedOriginal
          ? `全局替换已锁定: ${state.selectedOriginal.zh_cn} 的需求量 ${state.selectedOriginal.num}`
          : '请先选择要替换的方块')
      : ''"
              persistent-hint
          />
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
              @click="addReplacementRule(0)"
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
        <v-window-item value="details">
          <div class="d-flex align-center mb-4">
            <v-icon icon="mdi-magnify" class="mr-2"/>
            <v-combobox
                v-model="state.selectedOriginalDetails"
                label="查找方块（支持属性过滤）"
                :items="props.blocks ?? []"
                item-title="id"
                clearable
                :loading="!props.data"
                :filter="filterBlocks"
                :auto-filter-first="false"
            >
              <template v-slot:selection="{ item }">
                <div class="d-flex align-center">
                  <v-avatar size="32" rounded="0" class="mr-2">
                    <img :src="getBlockIcon(item.raw.id)" :alt="item.raw.id">
                  </v-avatar>
                  <div>
                    <span class="text-body-2">{{ item.raw.id }}</span>

                  </div>
                </div>
              </template>

              <template v-slot:item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps">
                  <template v-slot:prepend>
                    <v-avatar size="32" rounded="0" class="mr-2">
                      <img :src="getBlockIcon(item.raw.id)" :alt="item.raw.id">
                    </v-avatar>
                  </template>
                  <v-list-item-title class="d-flex align-center">
                    <span class="text-body-2">{{ item.raw }}</span>
                    <v-chip
                        v-if="hasProperties(item.raw)"
                        small
                        class="ml-2"
                        color="green"
                    >
                      {{ Object.keys(item.raw.properties).length }} 属性
                    </v-chip>
                  </v-list-item-title>
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
                    label="方块ID (例: minecraft:stone)"
                    placeholder="命名空间:方块名"
                    :rules="idRules"
                    @update:model-value="updateBlockData"
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                    v-model="propertiesInput"
                    label="方块属性"
                    placeholder="每行一个属性，格式：键=值"
                    rows="3"
                    :rules="propRules"
                    @update:model-value="updateBlockData"
                >
                  <template #append>
                    <v-tooltip text="每行输入一个属性，例如：color=blue">
                      <template v-slot:activator="{ props }">
                        <v-icon v-bind="props" icon="mdi-information" size="small"/>
                      </template>
                    </v-tooltip>
                  </template>
                </v-textarea>
              </v-col>
              <v-col cols="12">
                <div v-if="state.selectedReplacementDetails" class="preview-box">
                  <div class="text-caption text-grey">实时预览：</div>
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
          <th>模式</th>
          <th>原方块</th>
          <th>新方块</th>
          <th>数量</th>
          <th>操作</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(rule, index) in state.replacementRules" :key="index">
          <td>
            <v-chip :color="rule.replaceMode === 0 ? 'blue' : 'teal'" variant="tonal" size="small">
              {{ rule.replaceMode === 0 ? '简单' : '精准' }}
            </v-chip>
          </td>

          <td>
            <template v-if="rule.replaceMode === 0">
              <div class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getBlockIcon(rule.original.id)" :alt="rule.original.zh_cn">
                </v-avatar>
                {{ rule.original.zh_cn }}
              </div>
            </template>
            <template v-else>
              <div class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getBlockIcon(rule.originalDetails.id)" :alt="rule.originalDetails.id">
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
                  <img :src="getBlockIcon(`minecraft:${rule.replacement.block_name}`)" :alt="rule.replacement.zh_cn">
                </v-avatar>
                {{ rule.replacement.zh_cn }}
              </div>
              <div v-else class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getBlockIcon(rule.replacement)" :alt="rule.replacement">
                </v-avatar>
                {{ rule.replacement }}
              </div>
            </template>
            <template v-else>
              <div class="d-flex align-center">
                <v-avatar size="32" rounded="0" class="mr-2">
                  <img :src="getBlockIcon(rule.replacementDetails.id)" :alt="rule.replacementDetails.id">
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
              默认全局
            </template>

          </td>
          <td>
            <v-btn
                variant="text"
                color="error"
                icon="mdi-delete"
                @click="removeRule(index)"
            />
          </td>
        </tr>

        <tr v-if="state.replacementRules.length === 0">
          <td colspan="5" class="text-center text-grey">
            暂无替换规则
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
          确认替换操作
        </v-card-title>
        <v-card-subtitle>
          替换将导出为新蓝图
        </v-card-subtitle>
        <v-card-text>
          即将替换 {{ state.replacementRules.length }} 条方块规则
          <ul class="mt-2">
            <li v-for="(rule, index) in state.replacementRules" :key="index">
              {{ rule.replaceMode == 0 ? rule.original.zh_cn :  rule.originalDetails.id}} → {{ rule.replaceMode == 0 ? rule.replacement.zh_cn : rule.replacementDetails.id }} ×{{ rule.replaceMode == 0 ? rule.quantity : "全局"}}
            </li>
          </ul>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="state.showConfirmDialog = false">取消</v-btn>
          <v-btn
              color="info"
              :loading="state.isLoading"
              @click="executeReplacement"
          >
            确认执行
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