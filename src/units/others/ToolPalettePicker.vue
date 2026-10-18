<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {computed, onDeactivated, ref, watch} from 'vue'
import {materialName} from '../../modules/materials/block_names'
import {mapArtData} from '../../modules/map_art/map_art_data'
import {getBlockImg} from '../../modules/others'
import {blockColourFamilies, gravityBlocks} from '../../modules/toolbox/block-families'
const {t: $t, locale} = useI18n()

const props = defineProps<{modelValue: string[]; disabled?: boolean}>()
const emit = defineEmits<{'update:modelValue': [value: string[]]}>()
const open = ref(false), query = ref(''), groupBy = ref('material')
const expanded = ref<string[]>([]), draft = ref<string[]>([])
const chosen = computed(() => new Set(draft.value)), selected = computed(() => new Set(props.modelValue))
const families = ['white','grey','black','brown','red','orange','yellow','lime','green','cyan','blue','purple','magenta','pink']
const all = computed(() => (mapArtData.value ?? []).flatMap(group => group.items.map(block => ({...block, label: materialName(block.id, locale.value), group: group.name, groupTitle: $t(`desktop.group_${group.name}`)}))))
const matched = computed(() => {
  const needle = String(query.value ?? '').trim().toLowerCase()
  return needle ? all.value.filter(block => `${block.id} ${block.zh_cn} ${block.label}`.toLowerCase().includes(needle)) : all.value
})
const canonical = (id: string) => id.includes(':') ? id : 'minecraft:' + id
const sections = computed(() => {
  const buckets = new Map<string, {key: string; title: string; blocks: typeof all.value}>()
  for (const block of matched.value) {
    const key = groupBy.value === 'material' ? block.group : (blockColourFamilies[canonical(block.id)] ?? 'grey')
    let section = buckets.get(key)
    if (!section) { section = {key, title: groupBy.value === 'material' ? block.groupTitle : $t(`desktop.color_${key}`), blocks: []}; buckets.set(key, section) }
    section.blocks.push(block)
  }
  const sections = [...buckets.values()]
  if (groupBy.value === 'colour') sections.sort((a,b) => families.indexOf(a.key) - families.indexOf(b.key))
  return sections
})
const colors = computed(() => new Set(all.value.filter(block => selected.value.has(block.id)).map(block => block.average_rgb_hex)).size)
const gravityCount = computed(() => props.modelValue.filter(id => gravityBlocks.has(canonical(id))).length)
const imageUrls = new Map<string, string>()
const icon = (id: string) => { if (!imageUrls.has(id)) imageUrls.set(id, getBlockImg(id)); return imageUrls.get(id) }
function begin() { draft.value = [...props.modelValue]; expanded.value = []; query.value = ''; open.value = true }
function toggle(id: string) { const next = new Set(draft.value); if (!next.delete(id)) next.add(id); draft.value = [...next] }
function count(blocks: typeof all.value) { return blocks.reduce((n, block) => n + Number(chosen.value.has(block.id)), 0) }
function toggleSection(blocks: typeof all.value) {
  const next = new Set(draft.value), remove = count(blocks) === blocks.length
  blocks.forEach(block => remove ? next.delete(block.id) : next.add(block.id)); draft.value = [...next]
}
function selectVisible() { draft.value = [...new Set([...draft.value, ...matched.value.map(block => block.id)])] }
function save() { if (!draft.value.length) return; emit('update:modelValue', [...draft.value]); open.value = false }
watch([query, groupBy], () => { expanded.value = query.value?.trim() ? sections.value.map(section => section.key) : [] })
onDeactivated(() => { open.value = false })
</script>
<template>
  <section class="tool-palette">
    <v-btn block variant="tonal" color="primary" prepend-icon="mdi-palette-outline" :disabled="disabled" @click="begin">{{ $t('desktop.paletteButton', {count: modelValue.length}) }}</v-btn>
    <p class="text-caption my-2">{{ $t('desktop.paletteSummary', {count: modelValue.length, colors}) }}<span v-if="gravityCount">{{ $t('desktop.gravitySummary', {count: gravityCount}) }}</span></p>
    <v-dialog v-model="open" max-width="800" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center">{{ $t('desktop.paletteTitle') }}<v-spacer/><v-btn icon="mdi-close" :aria-label="$t('desktop.paletteCancel')" variant="text" @click="open = false"/></v-card-title>
        <div class="pa-4 pt-0 palette-filters">
          <v-text-field v-model="query" :label="$t('desktop.paletteSearch')" prepend-inner-icon="mdi-magnify" clearable hide-details density="compact"/>
          <v-btn-toggle v-model="groupBy" mandatory density="compact"><v-btn value="material">{{ $t('desktop.byMaterial') }}</v-btn><v-btn value="colour">{{ $t('desktop.byColor') }}</v-btn></v-btn-toggle>
          <div class="d-flex flex-wrap align-center ga-2 text-caption">{{ $t('desktop.selectedTypes', {count: draft.length}) }}<v-btn size="small" variant="text" @click="selectVisible">{{ $t('desktop.selectResults') }}</v-btn><v-btn size="small" variant="text" @click="draft = []">{{ $t('desktop.clearSelection') }}</v-btn></div>
        </div>
        <v-card-text class="palette-scroll">
          <v-list v-model:opened="expanded" open-strategy="multiple">
            <v-list-group v-for="section in sections" :key="section.key" :value="section.key">
              <template #activator="{props: activator}">
                <v-list-item v-bind="activator" :title="section.title" :subtitle="$t('desktop.groupCount', {selected: count(section.blocks), count: section.blocks.length})" class="category-header">
                  <template #prepend><v-checkbox-btn :model-value="count(section.blocks) === section.blocks.length" :indeterminate="count(section.blocks) > 0 && count(section.blocks) < section.blocks.length" :aria-label="$t('desktop.selectGroup', {name: section.title})" @click.stop="toggleSection(section.blocks)"/></template>
                </v-list-item>
              </template>
              <v-virtual-scroll v-if="expanded.includes(section.key)" :items="section.blocks" :item-height="64" max-height="320">
                <template #default="{item}">
                  <v-list-item :key="item.id" class="block-item" :title="item.label" :subtitle="item.id" @click="toggle(item.id)">
                    <template #prepend><v-checkbox-btn :model-value="chosen.has(item.id)" :aria-label="item.label" @click.stop="toggle(item.id)"/><img :src="icon(item.id)" :alt="item.id" width="32" height="32" loading="lazy" decoding="async" class="mr-3"/></template>
                    <template #append><span class="palette-swatch" :style="{background: item.average_rgb_hex}" :title="item.average_rgb_hex"/></template>
                  </v-list-item>
                </template>
              </v-virtual-scroll>
            </v-list-group>
          </v-list>
          <p v-if="!sections.length" class="text-caption">{{ $t('desktop.noBlocks') }}</p>
        </v-card-text>
        <v-card-actions><v-spacer/><v-btn @click="open = false">{{ $t('desktop.cancel') }}</v-btn><v-btn color="primary" :disabled="!draft.length" @click="save">{{ $t('desktop.applyPalette', {count: draft.length}) }}</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>
<style scoped>
.palette-filters { display: grid; gap: 12px; }
.palette-scroll { max-height: 55dvh; padding: 0 16px; }
.palette-swatch { width: 20px; height: 20px; border-radius: 4px; border: 1px solid #8885; }
.block-item { min-height: 64px; contain: layout paint; padding-inline-start: 8px !important; }
.block-item img { object-fit: contain; image-rendering: pixelated; }
</style>
