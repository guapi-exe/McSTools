import { shallowRef } from 'vue';
import type { ItemRendererResources, Resources } from 'deepslate';
import { loadResource } from './loadResource';

export const blockResources = shallowRef<Resources & ItemRendererResources>();

let resourcesRequest: Promise<void> | null = null;

export const loadThreeDBlocksResources = async () => {
  if (blockResources.value) return;

  // Loading can be requested by multiple panels at the same time.  Share the
  // in-flight work so two atlas/model parses never run concurrently.
  if (!resourcesRequest) {
    resourcesRequest = loadResource().finally(() => {
      resourcesRequest = null;
    });
  }

  await resourcesRequest;
};
