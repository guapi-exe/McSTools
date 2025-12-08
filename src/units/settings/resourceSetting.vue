<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  resourceList,
  isLoadingResources,
  loadResourceList,
  downloadResource,
  deleteResource,
  getResourceDisplayName,
  getResourceDescription,
  getResourceVersion,
  getResourceAuthors,
  getResourceBlockCount,
  getResourceItemCount,
  getResourceIconUrl,
  getRemoteIconUrl,
  ResourceItem,
  ResourceStatus
} from '../../modules/resource_manager';
import { opacity } from '../../modules/theme';
import { toast } from '../../modules/others';

const { t: $t } = useI18n()

const iconUrls = ref<Record<string, string>>({});
const showDeleteDialog = ref(false);
const deleteTargetKey = ref('');
const deleteTargetName = ref('');
const isDeleting = ref(false);

const getStatusColor = (status: ResourceStatus) => {
  switch (status) {
    case 'installed': return 'success';
    case 'not-installed': return 'grey';
    case 'update-available': return 'warning';
    case 'downloading': return 'info';
    default: return 'grey';
  }
};

const getStatusText = (status: ResourceStatus) => {
  switch (status) {
    case 'installed': return $t('settings.resourceSetting.status.installed');
    case 'not-installed': return $t('settings.resourceSetting.status.notInstalled');
    case 'update-available': return $t('settings.resourceSetting.status.updateAvailable');
    case 'downloading': return $t('settings.resourceSetting.status.downloading');
    default: return $t('settings.resourceSetting.status.unknown');
  }
};

const getStatusIcon = (status: ResourceStatus) => {
  switch (status) {
    case 'installed': return 'mdi-check-circle';
    case 'not-installed': return 'mdi-download';
    case 'update-available': return 'mdi-update';
    case 'downloading': return 'mdi-loading';
    default: return 'mdi-help-circle';
  }
};

const loadIcons = async () => {
  for (const item of resourceList.value) {
    if (item.status === 'installed' || item.status === 'update-available') {
      const url = await getResourceIconUrl(item.key);
      if (url) {
        iconUrls.value[item.key] = url;
      }
    } else {
      iconUrls.value[item.key] = getRemoteIconUrl(item.key);
    }
  }
};

const handleDownload = async (item: ResourceItem) => {
  if (item.status === 'downloading') {
    toast.warning($t('settings.resourceSetting.toast.downloading'));
    return;
  }
  await downloadResource(item.key);
  const url = await getResourceIconUrl(item.key);
  if (url) {
    iconUrls.value[item.key] = url;
  }
};

const handleRefresh = async () => {
  await loadResourceList();
  await loadIcons();
};

const handleIconError = (key: string) => {
  delete iconUrls.value[key];
};

const openDeleteDialog = (item: ResourceItem) => {
  deleteTargetKey.value = item.key;
  deleteTargetName.value = getResourceDisplayName(item);
  showDeleteDialog.value = true;
};

const confirmDelete = async () => {
  if (!deleteTargetKey.value) return;
  
  isDeleting.value = true;
  try {
    await deleteResource(deleteTargetKey.value);
    // 清除图标缓存
    delete iconUrls.value[deleteTargetKey.value];
    await loadIcons();
  } finally {
    isDeleting.value = false;
    showDeleteDialog.value = false;
    deleteTargetKey.value = '';
    deleteTargetName.value = '';
  }
};

onMounted(async () => {
  await loadResourceList();
  await loadIcons();
});
</script>

<template>
  <v-card 
    class="resource-setting-card"
    :style="{ '--surface-alpha': opacity }"
  >
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2 pb-2">
      <div class="d-flex align-center ga-2">
        <v-icon icon="mdi-package-variant" size="28" color="primary"></v-icon>
        <span class="text-h6">{{ $t('settings.resourceSetting.title') }}</span>
      </div>
      
      <v-btn
        variant="tonal"
        color="primary"
        size="small"
        @click="handleRefresh"
        :loading="isLoadingResources"
      >
        <v-icon start icon="mdi-refresh"></v-icon>
        {{ $t('settings.resourceSetting.refresh') }}
      </v-btn>
    </v-card-title>

    <v-divider></v-divider>

    <v-card-text class="resource-list-container pa-2">
      <v-progress-linear
        v-if="isLoadingResources"
        indeterminate
        color="primary"
        class="mb-2"
      ></v-progress-linear>
      
      <v-list class="resource-list" density="compact">
        <v-list-item
          v-for="item in resourceList"
          :key="item.key"
          class="resource-item mb-2"
          :class="{ 'downloading-item': item.status === 'downloading' }"
          rounded
        >
          <template #prepend>
            <v-avatar 
              :color="iconUrls[item.key] ? 'transparent' : 'primary'" 
              variant="tonal" 
              size="48"
              class="resource-icon"
            >
              <v-img
                v-if="iconUrls[item.key]"
                :src="iconUrls[item.key]"
                cover
                @error="handleIconError(item.key)"
              ></v-img>
              <span v-else class="text-h6 font-weight-bold">
                {{ item.key.charAt(0).toUpperCase() }}
              </span>
            </v-avatar>
          </template>
          
          <template #title>
            <div class="d-flex align-center ga-2 flex-wrap">
              <span class="text-subtitle-1 font-weight-medium">
                {{ getResourceDisplayName(item) }}
              </span>
              <v-chip
                :color="getStatusColor(item.status)"
                size="x-small"
                variant="flat"
              >
                <v-icon 
                  start 
                  :icon="getStatusIcon(item.status)" 
                  size="12"
                  :class="{ 'animate-spin': item.status === 'downloading' }"
                ></v-icon>
                {{ getStatusText(item.status) }}
              </v-chip>
              <v-chip
                v-if="getResourceVersion(item)"
                size="x-small"
                variant="tonal"
                color="info"
              >
                v{{ getResourceVersion(item) }}
              </v-chip>
            </div>
          </template>
          
          <template #subtitle>
            <div class="mt-1">
              <p class="text-caption text-grey mb-1" style="line-height: 1.4;">
                {{ getResourceDescription(item) || $t('settings.resourceSetting.noDescription') }}
              </p>
              <div class="d-flex align-center ga-2 flex-wrap">
                <v-chip size="x-small" variant="outlined" color="info">
                  <v-icon start icon="mdi-cube-outline" size="12"></v-icon>
                  {{ $t('settings.resourceSetting.blocks') }}: {{ getResourceBlockCount(item) }}
                </v-chip>
                <v-chip size="x-small" variant="outlined" color="info">
                  <v-icon start icon="mdi-border-all" size="12"></v-icon>
                  {{ $t('settings.resourceSetting.items') }}: {{ getResourceItemCount(item) }}
                </v-chip>
                <v-chip 
                  v-if="getResourceAuthors(item).length > 0"
                  size="x-small" 
                  variant="outlined"
                  color="info"
                >
                  <v-icon start icon="mdi-account" size="12"></v-icon>
                  {{ getResourceAuthors(item).join(', ') }}
                </v-chip>
                <v-chip size="x-small" variant="text" color="grey">
                  <v-icon start icon="mdi-tag" size="12"></v-icon>
                  {{ item.key }}
                </v-chip>
              </div>
            </div>
          </template>
          
          <template #append>
            <div class="d-flex align-center ga-2">
              <v-progress-circular
                v-if="item.status === 'downloading'"
                :model-value="item.downloadProgress || 0"
                :size="36"
                :width="3"
                color="info"
              >
                <span class="text-caption">{{ item.downloadProgress }}%</span>
              </v-progress-circular>
              
              <v-btn
                v-else-if="item.status === 'not-installed'"
                variant="tonal"
                color="success"
                size="small"
                @click="handleDownload(item)"
              >
                <v-icon icon="mdi-download"></v-icon>
                {{ $t('settings.resourceSetting.download') }}
              </v-btn>
              
              <template v-else-if="item.status === 'update-available'">
                <v-btn
                  variant="tonal"
                  color="warning"
                  size="small"
                  @click="handleDownload(item)"
                >
                  <v-icon icon="mdi-update"></v-icon>
                  {{ $t('settings.resourceSetting.update') }}
                </v-btn>
                <v-btn
                  variant="tonal"
                  color="error"
                  size="small"
                  @click="openDeleteDialog(item)"
                >
                  <v-icon icon="mdi-delete"></v-icon>
                </v-btn>
              </template>
              
              <template v-else-if="item.status === 'installed'">
                <v-btn
                  variant="tonal"
                  color="error"
                  size="small"
                  @click="openDeleteDialog(item)"
                >
                  <v-icon icon="mdi-delete"></v-icon>
                  {{ $t('settings.resourceSetting.delete') }}
                </v-btn>
              </template>
            </div>
          </template>
        </v-list-item>
        
        <div v-if="resourceList.length === 0 && !isLoadingResources" class="text-center py-8">
          <v-icon icon="mdi-package-variant-closed" size="64" color="grey"></v-icon>
          <p class="text-grey mt-2">{{ $t('settings.resourceSetting.noResources') }}</p>
        </div>
      </v-list>
    </v-card-text>
  </v-card>
  
  <!-- 删除确认对话框 -->
  <v-dialog v-model="showDeleteDialog" max-width="450" persistent>
    <v-card :style="{ '--surface-alpha': opacity }">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon color="error" icon="mdi-alert-circle"></v-icon>
        {{ $t('settings.resourceSetting.deleteDialog.title') }}
      </v-card-title>
      
      <v-card-text>
        {{ $t('settings.resourceSetting.deleteDialog.message', { name: deleteTargetName }) }}
        <br>
        <span class="text-caption text-grey">{{ $t('settings.resourceSetting.deleteDialog.hint') }}</span>
      </v-card-text>
      
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          variant="text"
          @click="showDeleteDialog = false"
          :disabled="isDeleting"
        >
          {{ $t('settings.resourceSetting.deleteDialog.cancel') }}
        </v-btn>
        <v-btn
          color="error"
          variant="tonal"
          @click="confirmDelete"
          :loading="isDeleting"
        >
          {{ $t('settings.resourceSetting.deleteDialog.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.resource-setting-card {
  height: calc(100vh - 10px);
  display: flex;
  flex-direction: column;
}

.resource-list-container {
  flex: 1;
  overflow-y: auto;
}

.resource-list {
  background: transparent;
}

.resource-item {
  border: 1px solid rgba(128, 128, 128, 0.2);
  transition: all 0.2s ease;
}

.resource-item:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
  background: rgba(var(--v-theme-primary), 0.04);
}

.resource-item.downloading-item {
  border-color: rgba(var(--v-theme-info), 0.6);
  background: rgba(var(--v-theme-info), 0.08);
}

.resource-icon {
  border-radius: 8px;
  overflow: hidden;
}

.resource-icon :deep(.v-img) {
  image-rendering: pixelated;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>