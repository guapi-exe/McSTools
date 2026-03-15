import { BlockPos, Direction, Vector } from '../index.js';
import { Mesh } from './Mesh.js';
import { SpecialRenderers } from './SpecialRenderer.js';
export class ChunkBuilder {
    gl;
    structure;
    resources;
    chunks = [];
    chunkSize;
    meshCache = [];
    meshCacheDirty = true;
    includeBlockPosBuffer = false;
    normalizedStates = new WeakSet();
    defaultPropertyEntriesCache = new Map();
    blockDefinitionCache = new Map();
    blockFlagsCache = new Map();
    blockMeshCache = new Map();
    specialMeshCache = new Map();
    getCachedBlockFlags(blockName) {
        const key = blockName.toString();
        let flags = this.blockFlagsCache.get(key);
        if (flags === undefined) {
            flags = this.resources.getBlockFlags(blockName);
            this.blockFlagsCache.set(key, flags);
        }
        return flags;
    }
    constructor(gl, structure, resources, chunkSize = 16) {
        this.gl = gl;
        this.structure = structure;
        this.resources = resources;
        this.chunkSize = typeof chunkSize === 'number' ? [chunkSize, chunkSize, chunkSize] : chunkSize;
        this.updateStructureBuffers();
    }
    setStructure(structure) {
        this.structure = structure;
        this.updateStructureBuffers();
    }
    setIncludeBlockPosBuffer(enabled) {
        if (this.includeBlockPosBuffer === enabled) {
            return;
        }
        this.includeBlockPosBuffer = enabled;
        this.rebuildTargetChunks();
    }
    updateStructureBuffers(chunkPositions) {
        if (!this.structure)
            return;
        const chunkPositionSet = this.createChunkPositionSet(chunkPositions);
        this.clearTargetChunks(chunkPositions);
        const forEachBlock = this.structure.forEachBlock;
        if (forEachBlock) {
            forEachBlock.call(this.structure, b => {
                this.processBlock(b, chunkPositionSet);
            });
        }
        else {
            for (const b of this.structure.getBlocks()) {
                this.processBlock(b, chunkPositionSet);
            }
        }
        this.rebuildTargetChunks(chunkPositions);
        this.meshCacheDirty = true;
    }
    async updateStructureBuffersAsync(chunkPositions, blocksPerSlice = 4000) {
        if (!this.structure)
            return;
        const slice = Math.max(1, blocksPerSlice);
        const chunkPositionSet = this.createChunkPositionSet(chunkPositions);
        this.clearTargetChunks(chunkPositions);
        let processed = 0;
        const forEachBlockAsync = this.structure.forEachBlockAsync;
        const processAndYield = async (b) => {
            this.processBlock(b, chunkPositionSet);
            processed += 1;
            if (processed % slice === 0) {
                await new Promise(resolve => {
                    if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => resolve());
                    }
                    else {
                        setTimeout(resolve, 0);
                    }
                });
            }
        };
        if (forEachBlockAsync) {
            await forEachBlockAsync.call(this.structure, processAndYield);
        }
        else {
            for (const b of this.structure.getBlocks()) {
                await processAndYield(b);
            }
        }
        this.rebuildTargetChunks(chunkPositions);
        this.meshCacheDirty = true;
    }
    createChunkPositionSet(chunkPositions) {
        return chunkPositions
            ? new Set(chunkPositions.map(pos => `${pos[0]},${pos[1]},${pos[2]}`))
            : undefined;
    }
    clearTargetChunks(chunkPositions) {
        if (!chunkPositions) {
            this.chunks.forEach(x => x.forEach(y => y.forEach(chunk => {
                chunk.mesh.clear();
                chunk.transparentMesh.clear();
            })));
            return;
        }
        chunkPositions.forEach(chunkPos => {
            const chunk = this.getChunk(chunkPos);
            chunk.mesh.clear();
            chunk.transparentMesh.clear();
        });
    }
    rebuildTargetChunks(chunkPositions) {
        const options = { pos: true, color: true, texture: true, normal: true, blockPos: this.includeBlockPosBuffer };
        if (!chunkPositions) {
            this.chunks.forEach(x => x.forEach(y => y.forEach(chunk => {
                chunk.mesh.rebuild(this.gl, options);
                chunk.transparentMesh.rebuild(this.gl, options);
            })));
            return;
        }
        chunkPositions.forEach(chunkPos => {
            const chunk = this.getChunk(chunkPos);
            chunk.mesh.rebuild(this.gl, options);
            chunk.transparentMesh.rebuild(this.gl, options);
        });
    }
    processBlock(b, chunkPositionSet) {
        const blockName = b.state.getName();
        const blockNameKey = blockName.toString();
        const state = b.state;
        const blockProps = state.getProperties();
        if (!this.normalizedStates.has(state)) {
            let defaultEntries = this.defaultPropertyEntriesCache.get(blockNameKey);
            if (!defaultEntries) {
                const defaultProps = this.resources.getDefaultBlockProperties(blockName) ?? {};
                defaultEntries = Object.entries(defaultProps);
                this.defaultPropertyEntriesCache.set(blockNameKey, defaultEntries);
            }
            for (const [k, v] of defaultEntries) {
                if (!(k in blockProps)) {
                    blockProps[k] = v;
                }
            }
            this.normalizedStates.add(state);
        }
        const chunkPos = [Math.floor(b.pos[0] / this.chunkSize[0]), Math.floor(b.pos[1] / this.chunkSize[1]), Math.floor(b.pos[2] / this.chunkSize[2])];
        if (chunkPositionSet && !chunkPositionSet.has(`${chunkPos[0]},${chunkPos[1]},${chunkPos[2]}`))
            return;
        const chunk = this.getChunk(chunkPos);
        try {
            let blockDefinition = this.blockDefinitionCache.get(blockNameKey);
            if (blockDefinition === undefined) {
                blockDefinition = this.resources.getBlockDefinition(blockName);
                this.blockDefinitionCache.set(blockNameKey, blockDefinition);
            }
            const blockFlags = this.getCachedBlockFlags(blockName);
            const cull = {
                up: this.needsCull(b, Direction.UP),
                down: this.needsCull(b, Direction.DOWN),
                west: this.needsCull(b, Direction.WEST),
                east: this.needsCull(b, Direction.EAST),
                north: this.needsCull(b, Direction.NORTH),
                south: this.needsCull(b, Direction.SOUTH),
            };
            if (blockFlags?.opaque &&
                !blockFlags?.semi_transparent &&
                cull.up && cull.down && cull.west && cull.east && cull.north && cull.south) {
                return;
            }
            const targetMesh = blockFlags?.semi_transparent
                ? chunk.transparentMesh
                : chunk.mesh;
            let placedBlockPos;
            if (blockDefinition) {
                const blockMesh = this.getCachedDefinitionMesh(blockNameKey, state, blockProps, cull, blockDefinition);
                if (!blockMesh.isEmpty()) {
                    placedBlockPos ??= new Vector(b.pos[0], b.pos[1], b.pos[2]);
                    targetMesh.mergeTranslated(blockMesh, b.pos[0], b.pos[1], b.pos[2], placedBlockPos);
                }
            }
            const specialMesh = this.getCachedSpecialMesh(state, b.nbt, cull);
            if (!specialMesh.isEmpty()) {
                placedBlockPos ??= new Vector(b.pos[0], b.pos[1], b.pos[2]);
                targetMesh.mergeTranslated(specialMesh, b.pos[0], b.pos[1], b.pos[2], placedBlockPos);
            }
        }
        catch (e) {
            console.error(`Error rendering block ${blockNameKey}`, e);
        }
    }
    getMeshes() {
        if (!this.meshCacheDirty) {
            return this.meshCache;
        }
        const meshes = [];
        for (const xs of this.chunks) {
            if (!xs)
                continue;
            for (const ys of xs) {
                if (!ys)
                    continue;
                for (const chunk of ys) {
                    if (!chunk)
                        continue;
                    if (!chunk.mesh.isEmpty())
                        meshes.push(chunk.mesh);
                    if (!chunk.transparentMesh.isEmpty())
                        meshes.push(chunk.transparentMesh);
                }
            }
        }
        this.meshCache = meshes;
        this.meshCacheDirty = false;
        return meshes;
    }
    getStats() {
        let chunkCount = 0;
        let meshCount = 0;
        let triangleCount = 0;
        for (const xs of this.chunks) {
            if (!xs)
                continue;
            for (const ys of xs) {
                if (!ys)
                    continue;
                for (const chunk of ys) {
                    if (!chunk)
                        continue;
                    const solidHasGeometry = !chunk.mesh.isEmpty();
                    const transparentHasGeometry = !chunk.transparentMesh.isEmpty();
                    if (!solidHasGeometry && !transparentHasGeometry)
                        continue;
                    chunkCount += 1;
                    if (solidHasGeometry) {
                        meshCount += 1;
                        triangleCount += chunk.mesh.quadIndices() / 3;
                    }
                    if (transparentHasGeometry) {
                        meshCount += 1;
                        triangleCount += chunk.transparentMesh.quadIndices() / 3;
                    }
                }
            }
        }
        return {
            chunkCount,
            meshCount,
            triangleCount,
        };
    }
    needsCull(block, dir) {
        const neighborPos = BlockPos.towards(block.pos, dir);
        const neighbor = this.structure.getBlockState
            ? this.structure.getBlockState(neighborPos)
            : this.structure.getBlock(neighborPos)?.state ?? null;
        if (!neighbor)
            return false;
        const neighborFlags = this.getCachedBlockFlags(neighbor.getName());
        if (block.state.getName().equals(neighbor.getName()) && neighborFlags?.self_culling) {
            return true;
        }
        if (neighborFlags?.opaque) {
            return !(dir === Direction.UP && block.state.isWaterlogged());
        }
        else {
            return block.state.isWaterlogged() && neighbor.isWaterlogged();
        }
    }
    getCachedDefinitionMesh(blockNameKey, state, blockProps, cull, blockDefinition) {
        const key = `block|${state.toString()}|${this.getCullMask(cull)}`;
        let mesh = this.blockMeshCache.get(key);
        if (mesh !== undefined) {
            return mesh;
        }
        mesh = blockDefinition.getMesh(state.getName(), blockProps, this.resources, this.resources, cull);
        mesh.computeNormals();
        this.blockMeshCache.set(key, mesh);
        return mesh;
    }
    getCachedSpecialMesh(state, nbt, cull) {
        const nbtKey = nbt?.toString();
        const key = `special|${state.toString()}|${this.getCullMask(cull)}|${nbtKey ?? ''}`;
        let mesh = this.specialMeshCache.get(key);
        if (mesh !== undefined) {
            return mesh;
        }
        mesh = SpecialRenderers.getBlockMesh(state, nbt, this.resources, cull);
        mesh.computeNormals();
        this.specialMeshCache.set(key, mesh);
        return mesh;
    }
    getCullMask(cull) {
        return (cull.up ? 1 : 0)
            | (cull.down ? 2 : 0)
            | (cull.north ? 4 : 0)
            | (cull.south ? 8 : 0)
            | (cull.west ? 16 : 0)
            | (cull.east ? 32 : 0);
    }
    getChunk(chunkPos) {
        const x = Math.abs(chunkPos[0]) * 2 + (chunkPos[0] < 0 ? 1 : 0);
        const y = Math.abs(chunkPos[1]) * 2 + (chunkPos[1] < 0 ? 1 : 0);
        const z = Math.abs(chunkPos[2]) * 2 + (chunkPos[2] < 0 ? 1 : 0);
        if (!this.chunks[x])
            this.chunks[x] = [];
        if (!this.chunks[x][y])
            this.chunks[x][y] = [];
        if (!this.chunks[x][y][z])
            this.chunks[x][y][z] = { mesh: new Mesh(), transparentMesh: new Mesh() };
        return this.chunks[x][y][z];
    }
}
//# sourceMappingURL=ChunkBuilder.js.map