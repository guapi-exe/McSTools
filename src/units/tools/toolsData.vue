<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from "vue";
import {encodeJSON, parseSNBTWithBigIntToString, restoreStringToBigInt} from "../../modules/snbt_to_json.ts";
import {Tag} from "../../modules/nbt/tag.ts";
import {fetchSchematicStr, schematic_id, schematicData} from "../../modules/tools_data.ts";
import {toast} from "../../modules/others.ts";
import JsonEditorVue from 'json-editor-vue3'
import {data, json_data} from "../../modules/toolsData_data.ts"
const isJson = ref(false)
const isLoading = ref(false);
const sureLoading = ref(false);
const couldView = ref(["tree", "form", "view"])
const get_schematicStr = async (id: number) => {
  try {
    isLoading.value = true
    data.value = await fetchSchematicStr(id)
    json_data.value = parseSNBTWithBigIntToString(data.value)
    isJson.value = true;
  }catch (e){
    toast.error(`源数据读取失败:${e}`, {
      timeout: 3000
    });
  }finally {
    isLoading.value = false
  }

}
onMounted(async()=>{

  let size = schematicData.value.sizes
  const [length, width, height] = size.split(',').map(Number);
  if (length * width * height >= 100*100*100) sureLoading.value = true
  else await get_schematicStr(schematic_id.value);
})

const updateJsonData = () => {

}
const updateModelValue = (val: Tag) => {
  const restored = restoreStringToBigInt(val);
  const snbtStr = encodeJSON(restored);
  console.log(snbtStr,"修改了值");
}
onBeforeUnmount(() => {
  json_data.value = undefined;
  isJson.value = false;
});
</script>

<template>
  <div class="data-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loader">
        <div class="spinner"></div>
        <p>加载结构中...</p>
      </div>
    </div>

    <div v-if="sureLoading" class="loading-overlay">
      <div class="loader">
        <v-alert
            variant="tonal"
            color="red"
            icon="mdi-information-outline"
            class="mt-4 monospace-font"
        >
          {{`该蓝图体积过大，尺寸${schematicData.sizes}，是否确认加载;加载会占用大量内存，甚至导致崩溃`}}
        </v-alert>
        <div class="button-group">
          <v-btn
              density="default"
              color="blue"
              variant="outlined"
              prepend-icon="mdi-reload-alert"
              @click="sureLoading = false;get_schematicStr(schematic_id)"
          >
            确认加载
          </v-btn>
        </div>
      </div>
    </div>

    <div v-if="!isLoading" class="json-wrapper">
      <json-editor-vue
          class="editor"
          v-model="json_data"
          currentMode="tree"
          :modeList="couldView"
          @change="updateJsonData"
          @update:modelValue="updateModelValue"
      />
    </div>
    <div v-else class="json-wrapper">
      <json-editor-vue
          class="editor"
          v-model="data"
          currentMode="code"
          :modeList="couldView"
      />
    </div>
  </div>
</template>

<style scoped>
.data-container {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.json-wrapper {
  margin: 4px;
  border: 1px solid #eee;
  border-radius: 4px;
}

.loader-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}

:deep(.virtual-list) {
  contain: strict;
  will-change: transform;
}

:deep(.vjs-tree__node) {
  contain: content;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}
.loader {
  text-align: center;
}

</style>