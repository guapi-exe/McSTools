<script setup lang="ts">
import {defineAsyncComponent, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef} from 'vue'
import {invoke} from '@tauri-apps/api/core'
import {generatedPayload} from '../../modules/toolbox/generated-payload'
import type {GeneratedStructure} from '../../modules/toolbox/types'
import type {ExportSource} from '../../modules/blueprint_export'

const BlueprintExportPanel = defineAsyncComponent(() => import('../tools/BlueprintExportPanel.vue'))
const props = defineProps<{prepare: () => Promise<{structure: GeneratedStructure; name: string}>}>()
const emit = defineEmits<{close: []}>()
const source = shallowRef<ExportSource>()
const error = ref(''), preparing = ref(false), busy = ref(false)
let epoch = 0, disposed = false
async function release(id: number) { await invoke('release_generated_blueprint', {generationId: id}).catch(() => {}) }
async function prepare() {
  if (preparing.value || source.value || disposed) return
  const run = ++epoch
  preparing.value = true; error.value = ''
  try {
    const result = await props.prepare()
    if (disposed || epoch !== run) return
    const generationId = await invoke<number>('stage_generated_blueprint', generatedPayload(result.structure, result.name))
    if (disposed || epoch !== run) { await release(generationId); return }
    source.value = {kind: 'generated', generation_id: generationId}
  } catch (reason) { if (!disposed && epoch === run) error.value = String(reason) }
  finally { if (epoch === run) preparing.value = false }
}
function dispose() {
  disposed = true; ++epoch
  if (source.value?.kind === 'generated') void release(source.value.generation_id)
  source.value = undefined
}
onMounted(prepare)
onBeforeUnmount(dispose)
onDeactivated(() => { dispose(); emit('close') })
</script>

<template>
  <v-dialog :model-value="true" :persistent="busy" max-width="760" @update:model-value="value => { if (!value && !busy) emit('close') }">
    <v-card class="generated-export-card">
      <v-card-title class="d-flex align-center">导出生成的蓝图<v-spacer/><v-btn icon="mdi-close" variant="text" :disabled="busy" aria-label="关闭导出" @click="emit('close')"/></v-card-title>
      <v-card-text>
        <v-progress-linear v-if="preparing" indeterminate color="primary" class="mb-3"/>
        <p v-if="preparing">正在准备当前生成结果，不会重新匹配颜色，也不会修改蓝图库。</p>
        <v-alert v-if="error" type="error" variant="tonal" role="alert">{{ error }}<v-btn @click="prepare" variant="text">重试</v-btn></v-alert>
        <BlueprintExportPanel v-if="source" :source="source" @busy="busy = $event"/>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<style scoped>
.generated-export-card { max-height: calc(100dvh - 48px); }
.generated-export-card > .v-card-text { overflow-y: auto; }
</style>
