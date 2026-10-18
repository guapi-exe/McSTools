<script setup lang="ts">
import {computed} from 'vue'
import type {ExportFormat, ExportOptions} from '../../modules/blueprint_export'
const props=defineProps<{modelValue:ExportOptions;formats:ExportFormat[];disabled?:boolean;fixedFormat?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:ExportOptions]}>()
const format=computed(()=>props.formats.find(item=>item.id===props.modelValue.format))
const subtype=computed(()=>format.value?.subtypes.find(item=>item.id===props.modelValue.subtype))
const versions=computed(()=>[{id:0,name:'只转换格式 · 保持源版本'},...(subtype.value?.versions??[])])
function chooseFormat(id:number){emit('update:modelValue',{...props.modelValue,format:id,subtype:props.formats.find(item=>item.id===id)?.subtypes[0]?.id??-1,targetDataVersion:null,includeAir:false,overrides:[]})}
function chooseSubtype(id:number){const allowed=format.value?.subtypes.find(item=>item.id===id)?.versions??[];emit('update:modelValue',{...props.modelValue,subtype:id,targetDataVersion:allowed.some(v=>v.id===props.modelValue.targetDataVersion)?props.modelValue.targetDataVersion:null,overrides:[]})}
function update(patch:Partial<ExportOptions>){emit('update:modelValue',{...props.modelValue,...patch,overrides:[]})}
</script>
<template>
  <fieldset :disabled="disabled" class="blueprint-format-fields">
    <v-select :model-value="modelValue.format" :items="formats" item-title="name" item-value="id" label="输出格式" :disabled="fixedFormat || disabled" density="compact" hide-details @update:model-value="chooseFormat"/>
    <v-select :model-value="modelValue.subtype" :items="format?.subtypes??[]" item-title="name" item-value="id" label="格式版本" :disabled="disabled" density="compact" hide-details @update:model-value="chooseSubtype"/>
    <v-select v-if="modelValue.format!==5" :model-value="modelValue.targetDataVersion??0" :items="versions" item-title="name" item-value="id" label="目标游戏版本" :disabled="disabled" density="compact" hide-details @update:model-value="value=>update({targetDataVersion:value||null})"/>
    <v-alert v-else type="info" density="compact" variant="tonal">BE 输出使用基岩版方块和含水层映射，不应用 Java 游戏版本转换。</v-alert>
    <v-checkbox v-if="modelValue.format===1" :model-value="modelValue.includeAir" :disabled="disabled" label="写入空气方块" density="compact" hide-details @update:model-value="value=>update({includeAir:!!value})"/>
  </fieldset>
</template>
<style scoped>
.blueprint-format-fields {border:0;min-width:0;padding:0;display:grid;gap:14px;}
</style>
