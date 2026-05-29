import type { Identifier, Resources } from 'deepslate';
import type { ThreeDBlocksResources } from '../types';

export const ensureThreeDBlocksResources = (
  resources: Resources | undefined | null,
): ThreeDBlocksResources => {
  if (!resources) {
    throw new Error('3DBLOCKS resources are not loaded yet');
  }
  return resources as ThreeDBlocksResources;
};

export const getDefaultBlockProperties = (
  resources: ThreeDBlocksResources,
  id: Identifier,
) => resources.getDefaultBlockProperties(id) ?? {};
