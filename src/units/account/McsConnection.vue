<script setup lang="ts">
import {ref, watch} from 'vue'
import {openLink} from '../../modules/others'
import {connectMcsApi, mcsConnectionDialog, mcsConnectionBusy, mcsConnectionError, mcsStatus, mcsStatusLabel, mcsSaved, mcsBlueprintCount, refreshMcsConnection, mcsErrorMessage} from '../../modules/web_schematic/mcs_api'
const keyInput = ref(''), error = ref('')
watch(mcsConnectionDialog, () => { keyInput.value = ''; error.value = '' })
async function connect() {
  if (!keyInput.value.trim() || mcsConnectionBusy.value) return
  error.value = ''
  try { await connectMcsApi(keyInput.value); mcsConnectionDialog.value = false }
  catch (cause) { error.value = mcsErrorMessage(cause) }
  finally { keyInput.value = '' }
}
async function disconnect() {
  error.value = ''
  try { await connectMcsApi('') }
  catch (cause) { error.value = mcsErrorMessage(cause) }
}
</script>
<template>
  <v-dialog v-model="mcsConnectionDialog" max-width="600" :persistent="mcsConnectionBusy">
    <v-card class="v-theme--custom" title="蓝图站账户与连接" prepend-icon="mdi-cloud-check-outline">
      <v-card-text>
        <v-alert variant="tonal" color="info" class="mb-4">
          <div class="font-weight-medium">{{ mcsStatusLabel }}</div>
          <div v-if="mcsBlueprintCount != null" class="text-body-2 mt-1">我的站点蓝图：{{ mcsBlueprintCount }} 项</div>
        </v-alert>
        <p class="text-body-2 mb-3">请使用包含 account:read、public:read 权限的 API Key。</p>
        <v-text-field v-model="keyInput" :label="mcsSaved ? '更换 API Key' : 'API Key'" type="password" autocomplete="off" spellcheck="false" variant="outlined" :disabled="mcsConnectionBusy" hide-details @keyup.enter="connect" />
        <v-alert v-if="error || mcsConnectionError" type="warning" variant="tonal" class="mt-3" density="compact">{{ error || mcsConnectionError }}</v-alert>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-1 px-4 pb-4">
        <v-btn variant="text" @click="openLink('https://www.mcschematic.top/account')">前往站点</v-btn>
        <v-btn v-if="mcsSaved" color="warning" :disabled="mcsConnectionBusy" @click="disconnect">断开连接</v-btn>
        <v-spacer />
        <v-btn v-if="(mcsSaved && mcsStatus !== 'connected') || mcsConnectionError" :disabled="mcsConnectionBusy || mcsStatus === 'checking' || mcsStatus === 'restoring'" @click="refreshMcsConnection">重试连接</v-btn>
        <v-btn :disabled="mcsConnectionBusy" @click="mcsConnectionDialog = false">关闭</v-btn>
        <v-btn color="info" :loading="mcsConnectionBusy" :disabled="!keyInput.trim()" @click="connect">保存并连接</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
