<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {computed} from 'vue'
import type {ExportFormat, ExportOptions} from '../../modules/blueprint_export'
const {t: $t} = useI18n()

const props=defineProps<{modelValue:ExportOptions;formats:ExportFormat[];disabled?:boolean;fixedFormat?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:ExportOptions]}>()
const format=computed(()=>props.formats.find(item=>item.id===props.modelValue.format))
const subtype=computed(()=>format.value?.subtypes.find(item=>item.id===props.modelValue.subtype))
const versions=computed(()=>[{id:0,name:$t('desktop.keepVersion')},...(subtype.value?.versions??[])])
function chooseFormat(id:number){emit('update:modelValue',{...props.modelValue,format:id,subtype:props.formats.find(item=>item.id===id)?.subtypes[0]?.id??-1,targetDataVersion:null,includeAir:false,overrides:[]})}
function chooseSubtype(id:number){const allowed=format.value?.subtypes.find(item=>item.id===id)?.versions??[];emit('update:modelValue',{...props.modelValue,subtype:id,targetDataVersion:allowed.some(v=>v.id===props.modelValue.targetDataVersion)?props.modelValue.targetDataVersion:null,overrides:[]})}
function update(patch:Partial<ExportOptions>){emit('update:modelValue',{...props.modelValue,...patch,overrides:[]})}
</script>
<template>
  <fieldset :disabled="disabled" class="blueprint-format-fields">
    <v-select :model-value="modelValue.format" :items="formats" item-title="name" item-value="id" :label="$t('desktop.outputFormat')" :disabled="fixedFormat || disabled" density="compact" hide-details @update:model-value="chooseFormat"/>
    <v-select :model-value="modelValue.subtype" :items="format?.subtypes??[]" item-title="name" item-value="id" :label="$t('desktop.formatVersion')" :disabled="disabled" density="compact" hide-details @update:model-value="chooseSubtype"/>
    <v-select v-if="modelValue.format!==5" :model-value="modelValue.targetDataVersion??0" :items="versions" item-title="name" item-value="id" :label="$t('desktop.gameVersion')" :disabled="disabled" density="compact" hide-details @update:model-value="value=>update({targetDataVersion:value||null})"/>
    <v-alert v-else type="info" density="compact" variant="tonal">{{ $t('desktop.bedrockNote') }}</v-alert>
    <v-checkbox v-if="modelValue.format===1" :model-value="modelValue.includeAir" :disabled="disabled" :label="$t('desktop.includeAir')" density="compact" hide-details @update:model-value="value=>update({includeAir:!!value})"/>
  </fieldset>
</template>
<style scoped>
.blueprint-format-fields {border:0;min-width:0;padding:0;display:grid;gap:14px;}
</style>
