<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef} from 'vue'
import {invoke} from '@tauri-apps/api/core'
import {useI18n} from 'vue-i18n'
import {schematic_id, schematicData, fetchSchematicStr} from '../../modules/tools_data'
import {change_data, showSaveDialog} from '../../modules/snbt_to_json'
import {toast} from '../../modules/others'
import {SourceClient} from '../../modules/nbt/source_client'
import type {SourceNode, SourcePage, SourcePath} from '../../modules/nbt/source_document'

const {t} = useI18n()
const loading = ref(false), error = ref(''), saving = ref(false)
const sureLoading = ref(false), filter = ref('')
const pages = shallowRef(new Map<string, SourcePage>())
const expanded = ref(new Set<string>(['[]']))
const pending = ref(new Set<string>())
const root = shallowRef<SourceNode>()
const editor = shallowRef<SourceNode>(), editText = ref(''), editError = ref(''), editing = ref(false)
let client: SourceClient | undefined, disposed = false, epoch = 0
const keyOf = (path: SourcePath) => JSON.stringify(path)
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const readonly = computed(() => schematicData.value?.schematic_type === 4)
type Row = {key: string; node: SourceNode; depth: number; more?: number}
const rows = computed(() => {
  const result: Row[] = []
  const visit = (node: SourceNode, depth: number) => {
    const key = keyOf(node.path)
    result.push({key, node, depth})
    if (!expanded.value.has(key)) return
    const page = pages.value.get(key)
    page?.items.forEach(child => visit(child, depth + 1))
    if (page?.next != null) result.push({key: key + ':more', node, depth: depth + 1, more: page.next})
  }
  if (root.value) visit(root.value, 0)
  const query = filter.value?.trim().toLowerCase()
  return query ? result.filter(row => row.more == null && `${row.node.name} ${row.node.preview}`.toLowerCase().includes(query)) : result
})

async function load() {
  const id = schematic_id.value
  if (id == null || loading.value || disposed) return
  const request = ++epoch
  loading.value = true; error.value = ''; sureLoading.value = false
  try {
    // Paint the tab/loading shell before fetching a potentially large string.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    if (disposed || request !== epoch) return
    client?.dispose(); client = new SourceClient()
    const text = await fetchSchematicStr(id)
    if (disposed || request !== epoch || schematic_id.value !== id) return
    if (!text.length) throw new Error('此蓝图超出源数据查看大小限制，仍可使用预览和转换功能。')
    const page = await client.request<SourcePage>('load', {text})
    if (disposed || request !== epoch || schematic_id.value !== id) return
    root.value = page.node
    pages.value = new Map([['[]', page]])
    expanded.value = new Set(['[]'])
  } catch (cause) { if (!disposed && request === epoch) error.value = message(cause) }
  finally { if (!disposed && request === epoch) loading.value = false }
}
async function loadPage(node: SourceNode, offset = 0) {
  const key = keyOf(node.path), request = epoch
  if (!client || pending.value.has(key)) return
  pending.value.add(key)
  try {
    const page = await client.request<SourcePage>('page', {path: node.path, offset})
    if (disposed || request !== epoch) return
    const old = pages.value.get(key)
    pages.value = new Map(pages.value).set(key, {...page, items: offset && old ? [...old.items, ...page.items] : page.items})
  } catch (cause) { if (!disposed && request === epoch) error.value = message(cause) }
  finally { pending.value.delete(key) }
}
function toggle(node: SourceNode) {
  if (!node.size) return
  const key = keyOf(node.path)
  if (expanded.value.has(key)) expanded.value.delete(key)
  else { expanded.value.add(key); if (!pages.value.has(key)) void loadPage(node) }
}
async function openEditor(node: SourceNode) {
  if (!client || readonly.value || editing.value) return
  editing.value = true; editError.value = ''; error.value = ''
  try { editText.value = await client.request<string>('edit', {path: node.path}); if (!disposed) editor.value = node }
  catch (cause) { if (!disposed) error.value = message(cause) }
  finally { editing.value = false }
}
async function applyEdit() {
  if (!client || !editor.value || editing.value) return
  editing.value = true; editError.value = ''
  try {
    await client.request('update', {path: editor.value.path, text: editText.value})
    if (disposed) return
    change_data.value = true
    const page = await client.request<SourcePage>('page')
    if (disposed) return
    root.value = page.node; pages.value = new Map([['[]', page]]); expanded.value = new Set(['[]'])
    editor.value = undefined
  } catch (cause) { if (!disposed) editError.value = message(cause) }
  finally { editing.value = false }
}
async function saveChange() {
  const id = schematic_id.value
  if (!client || id == null || readonly.value || saving.value) return
  saving.value = true
  try {
    const snbt = await client.request<string>('save')
    if (disposed || schematic_id.value !== id) return
    await invoke('save_snbt', {id, snbt})
    if (disposed || schematic_id.value !== id) return
    change_data.value = false; showSaveDialog.value = false
    toast.success(t('toolsData.saveSuccess'))
  } catch (cause) { if (!disposed) toast.error(t('toolsData.saveError', {error: message(cause)})) }
  finally { saving.value = false }
}
onMounted(() => {
  const size = schematicData.value?.sizes?.split(',').map(Number) ?? []
  if (size.length === 3 && size.reduce((a, b) => a * b, 1) >= 1_000_000) sureLoading.value = true
  else void load()
})
onBeforeUnmount(() => {
  disposed = true; ++epoch; client?.dispose()
  change_data.value = false; showSaveDialog.value = false
})
</script>

<template>
  <section class="data-container" aria-label="蓝图源数据">
    <div class="source-toolbar">
      <v-icon icon="mdi-file-tree-outline" color="info" />
      <span class="text-body-2">源数据 · 按需展开</span>
      <v-spacer />
      <v-text-field v-model="filter" label="筛选已展开的字段" prepend-inner-icon="mdi-magnify" density="compact" variant="outlined" hide-details clearable class="source-filter" />
      <v-btn size="small" variant="text" :disabled="!root" @click="expanded = new Set(['[]'])">折叠子节点</v-btn>
      <v-btn v-if="change_data" size="small" color="info" @click="showSaveDialog = true">保存修改</v-btn>
    </div>
    <v-alert v-if="error" type="warning" variant="tonal" density="compact" class="source-error ma-3" closable @click:close="error = ''">
      {{ error }} <v-btn v-if="!root" variant="text" size="small" @click="load">重试</v-btn>
    </v-alert>
    <div v-if="loading" class="source-placeholder" role="status"><v-progress-circular indeterminate color="info" /><span>{{ t('toolsData.loading') }}</span></div>
    <div v-else-if="sureLoading" class="source-placeholder">
      <v-alert variant="tonal" color="warning">{{ t('toolsData.tooLarge', {size: schematicData?.sizes ?? ''}) }}</v-alert>
      <v-btn color="info" @click="load">{{ t('toolsData.confirmLoad') }}</v-btn>
    </div>
    <v-virtual-scroll v-else-if="root" :items="rows" :item-height="36" class="source-tree" role="tree" aria-label="NBT 字段" :aria-busy="pending.size > 0">
      <template #default="{item}">
        <div v-if="item.more != null" class="source-row" :style="{paddingLeft: `${12 + item.depth * 20}px`}">
          <v-btn variant="text" color="info" size="small" :loading="pending.has(keyOf(item.node.path))" @click="loadPage(item.node, item.more)">加载后续项（{{ item.more }} / {{ item.node.size }}）</v-btn>
        </div>
        <div v-else class="source-row" role="treeitem" :aria-level="item.depth + 1" :aria-expanded="item.node.size ? expanded.has(item.key) : undefined" tabindex="0" :style="{paddingLeft: `${12 + item.depth * 20}px`}" @dblclick="openEditor(item.node)" @keydown.enter.prevent="item.node.size ? toggle(item.node) : openEditor(item.node)" @keydown.space.prevent="toggle(item.node)">
          <button class="source-expand" :disabled="!item.node.size" :aria-label="`${expanded.has(item.key) ? '折叠' : '展开'} ${item.node.name}`" @click="toggle(item.node)"><v-icon size="18" :icon="item.node.size ? (expanded.has(item.key) ? 'mdi-chevron-down' : 'mdi-chevron-right') : 'mdi-circle-small'" /></button>
          <span class="source-name" :title="item.node.name">{{ item.node.name }}</span>
          <span class="source-type">{{ item.node.type }}</span>
          <span class="source-value" :title="item.node.preview">{{ item.node.preview }}</span>
          <v-btn v-if="!readonly" icon="mdi-pencil-outline" variant="text" size="x-small" :aria-label="`编辑 ${item.node.name}`" :disabled="editing" @click.stop="openEditor(item.node)" />
        </div>
      </template>
    </v-virtual-scroll>
    <v-dialog :model-value="!!editor" max-width="800" :persistent="editing" @update:model-value="value => { if (!value) editor = undefined }">
      <v-card :title="`编辑 ${editor?.name ?? ''}`">
        <v-card-text>
          <p class="text-caption mb-3">SNBT 格式：字符串需加引号；Byte / Short / Long / Float 分别使用 b / s / l / f 后缀。应用后仍需保存到蓝图。</p>
          <v-textarea v-model="editText" label="节点 SNBT" variant="outlined" rows="14" spellcheck="false" class="source-code" :disabled="editing" />
          <v-alert v-if="editError" type="error" variant="tonal">{{ editError }}</v-alert>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn :disabled="editing" @click="editor = undefined">取消</v-btn><v-btn color="info" :loading="editing" @click="applyEdit">应用修改</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="showSaveDialog" max-width="600" :persistent="saving">
      <v-card :title="t('toolsData.confirmSave')">
        <v-card-text>{{ readonly ? t('toolsData.noEditForType4') : t('toolsData.saveWarning') }}</v-card-text>
        <v-card-actions><v-spacer /><v-btn :disabled="saving" @click="showSaveDialog = false">{{ t('toolsData.cancel') }}</v-btn><v-btn color="info" :disabled="readonly" :loading="saving" @click="saveChange">{{ t('toolsData.confirmSaveChange') }}</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.data-container { height: calc(100vh - 160px); min-height: 360px; display: flex; flex-direction: column; overflow: hidden; color: rgb(var(--v-theme-on-surface)); }
.source-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 16px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1); }
.source-filter { max-width: 280px; min-width: 180px; }
.source-error { flex: 0 0 auto; }
.source-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; gap: 16px; padding: 24px; }
.source-tree { flex: 1; min-height: 240px; font-family: Consolas, monospace; }
.source-row { height: 36px; display: flex; align-items: center; gap: 10px; padding-right: 12px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .035); }
.source-row:hover, .source-row:focus-visible { background: rgba(var(--v-theme-info), .08); }
.source-expand { flex: 0 0 24px; height: 28px; }
.source-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 48%; }
.source-type { opacity: .7; font-size: 11px; flex-shrink: 0; }
.source-value { color: rgb(var(--v-theme-info)); flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; }
.source-code { font-family: Consolas, monospace; }
</style>
