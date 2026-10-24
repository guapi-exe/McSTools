import { shallowRef } from 'vue';
import type { ItemRendererResources, Resources } from 'deepslate';

export const blockResources = shallowRef<Resources & ItemRendererResources>();

let resourcesRequest: Promise<void> | null = null;

export const loadThreeDBlocksResources = async () => {
  if (blockResources.value) return;

  // Loading can be requested by multiple panels at the same time.  Share the
  // in-flight work so two atlas/model parses never run concurrently.
  if (!resourcesRequest) {
    resourcesRequest = import('./loadResource').then(({loadResource}) => loadResource()).finally(() => {
      resourcesRequest = null;
    });
  }

  await resourcesRequest;
};
