<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
    case 'installed': return '已安装';
    case 'not-installed': return '未安装';
    case 'update-available': return '可更新';
    case 'downloading': return '下载中';
    default: return '未知';
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
    toast.warning('该资源正在下载中...');
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
        <span class="text-h6">资源管理</span>
      </div>
      
      <v-btn
        variant="tonal"
        color="primary"
        size="small"
        @click="handleRefresh"
        :loading="isLoadingResources"
      >
        <v-icon start icon="mdi-refresh"></v-icon>
        刷新
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
                {{ getResourceDescription(item) || '暂无描述' }}
              </p>
              <div class="d-flex align-center ga-2 flex-wrap">
                <v-chip size="x-small" variant="outlined" color="info">
                  <v-icon start icon="mdi-cube-outline" size="12"></v-icon>
                  方块: {{ getResourceBlockCount(item) }}
                </v-chip>
                <v-chip size="x-small" variant="outlined" color="info">
                  <v-icon start icon="mdi-border-all" size="12"></v-icon>
                  物品: {{ getResourceItemCount(item) }}
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
                下载
              </v-btn>
              
              <template v-else-if="item.status === 'update-available'">
                <v-btn
                  variant="tonal"
                  color="warning"
                  size="small"
                  @click="handleDownload(item)"
                >
                  <v-icon icon="mdi-update"></v-icon>
                  更新
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
                  删除
                </v-btn>
              </template>
            </div>
          </template>
        </v-list-item>
        
        <div v-if="resourceList.length === 0 && !isLoadingResources" class="text-center py-8">
          <v-icon icon="mdi-package-variant-closed" size="64" color="grey"></v-icon>
          <p class="text-grey mt-2">没有找到资源</p>
        </div>
      </v-list>
    </v-card-text>
  </v-card>
  
  <!-- 删除确认对话框 -->
  <v-dialog v-model="showDeleteDialog" max-width="450" persistent>
    <v-card :style="{ '--surface-alpha': opacity }">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon color="error" icon="mdi-alert-circle"></v-icon>
        确认卸载
      </v-card-title>
      
      <v-card-text>
        确定要卸载资源 <strong>{{ deleteTargetName }}</strong> 吗？
        <br>
        <span class="text-caption text-grey">该操作将删除本地资源文件，可以重新下载。</span>
      </v-card-text>
      
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          variant="text"
          @click="showDeleteDialog = false"
          :disabled="isDeleting"
        >
          取消
        </v-btn>
        <v-btn
          color="error"
          variant="tonal"
          @click="confirmDelete"
          :loading="isDeleting"
        >
          确认卸载
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