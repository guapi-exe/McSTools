import { ref } from 'vue';
import type { ItemRendererResources, Resources } from 'deepslate';
import { loadResource } from './loadResource';

export const blockResources = ref<Resources & ItemRendererResources>();

export const loadThreeDBlocksResources = async () => {
  await loadResource();
};
