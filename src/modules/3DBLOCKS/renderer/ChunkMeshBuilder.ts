import {
  Direction,
  Identifier,
  SpecialRenderers,
  type BlockFlags,
  type Cull,
  type Mesh,
} from 'deepslate';
import type { BlockWorld, PlacedBlock } from '../core/BlockWorld';
import { chunkKey } from '../core/chunk';
import { getDefaultBlockProperties } from '../resources/ResourceAdapter';
import type { GLContext, ThreeDBlocksResources, Vec3 } from '../types';
import { createMeshDraft, type ChunkMeshData, type MeshDraft } from './GpuMesh';

export interface ChunkBuildResult {
  chunkPos: Vec3;
  solid?: ChunkMeshData;
  transparent?: ChunkMeshData;
  triangleCount: number;
}

export type ChunkBuildProgress = (
  result: ChunkBuildResult,
  builtChunks: number,
  totalChunks: number,
) => void | Promise<void>;

const DIRECTIONS = [
  Direction.UP,
  Direction.DOWN,
  Direction.NORTH,
  Direction.SOUTH,
  Direction.WEST,
  Direction.EAST,
] as const;

const directionOffset: Record<string, Vec3> = {
  [Direction.UP]: [0, 1, 0],
  [Direction.DOWN]: [0, -1, 0],
  [Direction.NORTH]: [0, 0, -1],
  [Direction.SOUTH]: [0, 0, 1],
  [Direction.WEST]: [-1, 0, 0],
  [Direction.EAST]: [1, 0, 0],
};

const getCullMask = (cull: Cull) => (
  (cull.up ? 1 : 0)
  | (cull.down ? 2 : 0)
  | (cull.north ? 4 : 0)
  | (cull.south ? 8 : 0)
  | (cull.west ? 16 : 0)
  | (cull.east ? 32 : 0)
);

const stateNbtKey = (nbt: unknown) => {
  if (nbt === undefined || nbt === null) return '';
  try {
    return JSON.stringify(nbt);
  } catch {
    return String(nbt);
  }
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException('3DBLOCKS mesh build aborted', 'AbortError');
  }
};

const yieldToBrowser = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => resolve());
  } else {
    setTimeout(resolve, 0);
  }
});

export class ChunkMeshBuilder {
  private blockDefinitionCache = new Map<string, ReturnType<ThreeDBlocksResources['getBlockDefinition']>>();
  private blockFlagsCache = new Map<string, BlockFlags | null>();
  private blockMeshCache = new Map<string, Mesh>();
  private specialMeshCache = new Map<string, Mesh>();

  constructor(
    private readonly gl: GLContext,
    private world: BlockWorld,
    private readonly resources: ThreeDBlocksResources,
    readonly chunkSize: number,
    private readonly supportsUint32Indices = true,
  ) {}

  setWorld(world: BlockWorld) {
    this.world = world;
    this.blockMeshCache.clear();
    this.specialMeshCache.clear();
  }

  buildChunks(chunkPositions?: Vec3[]) {
    const targets = chunkPositions ?? this.world.getChunkPositions(this.chunkSize);
    const results: ChunkBuildResult[] = [];
    for (const chunkPos of targets) {
      results.push(this.buildChunk(chunkPos));
    }
    return results;
  }

  async buildChunksAsync(chunkPositions: Vec3[] | undefined, blocksPerSlice = 4000, signal?: AbortSignal) {
    const results: ChunkBuildResult[] = [];
    await this.buildChunksProgressiveAsync(chunkPositions, blocksPerSlice, signal, (result) => {
      results.push(result);
    });
    return results;
  }

  async buildChunksProgressiveAsync(
    chunkPositions: Vec3[] | undefined,
    blocksPerSlice = 4000,
    signal?: AbortSignal,
    onChunk?: ChunkBuildProgress,
  ) {
    const targets = chunkPositions ?? this.world.getChunkPositions(this.chunkSize);
    const sliceState = { processed: 0 };

    for (let index = 0; index < targets.length; index += 1) {
      const chunkPos = targets[index];
      throwIfAborted(signal);
      const result = await this.buildChunkAsync(chunkPos, blocksPerSlice, sliceState, signal);
      await onChunk?.(result, index + 1, targets.length);
    }
  }

  private buildChunk(chunkPos: Vec3): ChunkBuildResult {
    const solid = createMeshDraft();
    const transparent = createMeshDraft();
    let triangleCount = 0;

    for (const block of this.world.getBlocksInChunk(chunkPos, this.chunkSize)) {
      triangleCount += this.appendBlock(block, solid, transparent);
    }

    return {
      chunkPos,
      solid: this.toMeshData(solid),
      transparent: this.toMeshData(transparent),
      triangleCount,
    };
  }

  private async buildChunkAsync(
    chunkPos: Vec3,
    blocksPerSlice: number,
    sliceState: { processed: number },
    signal?: AbortSignal,
  ): Promise<ChunkBuildResult> {
    const solid = createMeshDraft();
    const transparent = createMeshDraft();
    let triangleCount = 0;

    for (const block of this.world.getBlocksInChunk(chunkPos, this.chunkSize)) {
      throwIfAborted(signal);
      triangleCount += this.appendBlock(block, solid, transparent);
      sliceState.processed += 1;

      if (sliceState.processed >= blocksPerSlice) {
        sliceState.processed = 0;
        await yieldToBrowser();
        throwIfAborted(signal);
      }
    }

    return {
      chunkPos,
      solid: this.toMeshData(solid),
      transparent: this.toMeshData(transparent),
      triangleCount,
    };
  }

  private appendBlock(block: PlacedBlock, solid: MeshDraft, transparent: MeshDraft) {
    const state = block.state;
    const blockName = state.getName();
    const flags = this.getBlockFlags(blockName);
    const cull = this.getCull(block);

    if (flags?.opaque && !flags.semi_transparent && DIRECTIONS.every((dir) => cull[dir])) {
      return 0;
    }

    const target = flags?.semi_transparent || !flags?.opaque ? transparent : solid;
    const before = target.indices.length;
    const blockDefinition = this.getBlockDefinition(blockName);

    if (blockDefinition) {
      const mesh = this.getDefinitionMesh(block, cull, blockDefinition);
      this.appendMesh(mesh, block.pos, target);
    }

    const specialMesh = this.getSpecialMesh(block, cull);
    this.appendMesh(specialMesh, block.pos, target);

    return (target.indices.length - before) / 3;
  }

  private getDefinitionMesh(block: PlacedBlock, cull: Cull, blockDefinition: NonNullable<ReturnType<ThreeDBlocksResources['getBlockDefinition']>>) {
    const blockName = block.state.getName();
    const defaultProps = getDefaultBlockProperties(this.resources, blockName);
    const props = { ...defaultProps, ...block.state.getProperties() };
    const key = `block|${block.key}|${getCullMask(cull)}`;
    let mesh = this.blockMeshCache.get(key);
    if (mesh) return mesh;

    mesh = blockDefinition.getMesh(blockName, props, this.resources, this.resources, cull);
    mesh.computeNormals();
    this.blockMeshCache.set(key, mesh);
    return mesh;
  }

  private getSpecialMesh(block: PlacedBlock, cull: Cull) {
    const key = `special|${block.key}|${getCullMask(cull)}|${stateNbtKey(block.nbt)}`;
    let mesh = this.specialMeshCache.get(key);
    if (mesh) return mesh;

    mesh = SpecialRenderers.getBlockMesh(block.state, block.nbt as never, this.resources, cull);
    mesh.computeNormals();
    this.specialMeshCache.set(key, mesh);
    return mesh;
  }

  private appendMesh(mesh: Mesh, pos: Vec3, target: MeshDraft) {
    if (mesh.isEmpty()) return;
    for (const quad of mesh.quads) {
      const base = target.vertices.length / 15;
      for (const vertex of quad.vertices()) {
        const texture = vertex.texture ?? [0, 0];
        const textureLimit = vertex.textureLimit ?? [0, 0, 1, 1];
        const color = vertex.color ?? [1, 1, 1];
        const normal = vertex.normal ?? quad.normal();
        target.vertices.push(
          vertex.pos.x + pos[0],
          vertex.pos.y + pos[1],
          vertex.pos.z + pos[2],
          texture[0],
          texture[1],
          textureLimit[0],
          textureLimit[1],
          textureLimit[2],
          textureLimit[3],
          color[0],
          color[1],
          color[2],
          normal.x,
          normal.y,
          normal.z,
        );
      }
      target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  private toMeshData(draft: MeshDraft): ChunkMeshData | undefined {
    if (draft.indices.length === 0) return undefined;
    const vertices = new Float32Array(draft.vertices);
    const usesUint32 = draft.vertices.length / 15 > 65535;
    if (usesUint32 && !this.supportsUint32Indices) {
      throw new Error('3DBLOCKS chunk mesh exceeds WebGL1 Uint16 index limit and OES_element_index_uint is unavailable');
    }
    const indexType = usesUint32 ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT;
    const indices = usesUint32 ? new Uint32Array(draft.indices) : new Uint16Array(draft.indices);
    return {
      vertices,
      indices,
      indexType,
      triangleCount: draft.indices.length / 3,
    };
  }

  private getCull(block: PlacedBlock): Cull {
    const cull: Cull = {};
    for (const dir of DIRECTIONS) {
      cull[dir] = this.needsCull(block, dir);
    }
    return cull;
  }

  private needsCull(block: PlacedBlock, dir: Direction) {
    const offset = directionOffset[dir];
    const neighborPos: Vec3 = [
      block.pos[0] + offset[0],
      block.pos[1] + offset[1],
      block.pos[2] + offset[2],
    ];
    const neighbor = this.world.getBlockState(neighborPos);
    if (!neighbor) return false;

    const neighborFlags = this.getBlockFlags(neighbor.getName());
    if (block.state.getName().equals(neighbor.getName()) && neighborFlags?.self_culling) {
      return true;
    }
    if (neighborFlags?.opaque) {
      return !(dir === Direction.UP && block.state.isWaterlogged());
    }
    return block.state.isWaterlogged() && neighbor.isWaterlogged();
  }

  private getBlockDefinition(id: Identifier) {
    const key = id.toString();
    if (!this.blockDefinitionCache.has(key)) {
      this.blockDefinitionCache.set(key, this.resources.getBlockDefinition(id));
    }
    return this.blockDefinitionCache.get(key) ?? null;
  }

  private getBlockFlags(id: Identifier) {
    const key = id.toString();
    if (!this.blockFlagsCache.has(key)) {
      this.blockFlagsCache.set(key, this.resources.getBlockFlags(id));
    }
    return this.blockFlagsCache.get(key) ?? null;
  }

  chunkKey(pos: Vec3) {
    return chunkKey(pos);
  }
}
