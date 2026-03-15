import { vec3 } from 'gl-matrix';
import type { Resources, StructureProvider } from '../index.js';
import { Mesh } from './Mesh.js';
export declare class ChunkBuilder {
    private readonly gl;
    private structure;
    private readonly resources;
    private chunks;
    private readonly chunkSize;
    private meshCache;
    private meshCacheDirty;
    private includeBlockPosBuffer;
    private readonly normalizedStates;
    private readonly defaultPropertyEntriesCache;
    private readonly blockDefinitionCache;
    private readonly blockFlagsCache;
    private readonly blockMeshCache;
    private readonly specialMeshCache;
    private getCachedBlockFlags;
    constructor(gl: WebGLRenderingContext, structure: StructureProvider, resources: Resources, chunkSize?: number | vec3);
    setStructure(structure: StructureProvider): void;
    setIncludeBlockPosBuffer(enabled: boolean): void;
    updateStructureBuffers(chunkPositions?: vec3[]): void;
    updateStructureBuffersAsync(chunkPositions?: vec3[], blocksPerSlice?: number): Promise<void>;
    private createChunkPositionSet;
    private clearTargetChunks;
    private rebuildTargetChunks;
    private processBlock;
    getMeshes(): Mesh[];
    getStats(): {
        chunkCount: number;
        meshCount: number;
        triangleCount: number;
    };
    private needsCull;
    private getCachedDefinitionMesh;
    private getCachedSpecialMesh;
    private getCullMask;
    private getChunk;
}
//# sourceMappingURL=ChunkBuilder.d.ts.map