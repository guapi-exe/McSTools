import { BlockState } from 'deepslate';
import { blockToChunk, chunkKey, parseChunkKey } from './chunk';
import type { BlockProperties, RenderableBlock, Vec3 } from '../types';

export interface PlacedBlock {
  pos: Vec3;
  state: BlockState;
  key: string;
  nbt?: unknown;
}

const normalizeProperties = (properties: Record<string, unknown> = {}): BlockProperties => {
  const normalized: BlockProperties = {};
  Object.keys(properties).forEach((key) => {
    const value = properties[key];
    if (value !== undefined && value !== null) {
      normalized[key] = String(value);
    }
  });
  return normalized;
};

const createStateKey = (id: string, properties: BlockProperties) => {
  const entries = Object.keys(properties)
    .sort()
    .map((key) => `${key}=${properties[key]}`)
    .join(',');
  return entries.length > 0 ? `${id}[${entries}]` : id;
};

const posIndex = (size: Vec3, pos: Vec3) => pos[0] * size[1] * size[2] + pos[1] * size[2] + pos[2];

export class BlockWorld {
  private readonly states = new Map<string, BlockState>();
  private readonly blocks: PlacedBlock[] = [];
  private readonly blockMap = new Map<number, PlacedBlock>();
  private readonly chunkIndexes = new Map<number, Map<string, PlacedBlock[]>>();

  constructor(private readonly size: Vec3) {}

  getSize(): Vec3 {
    return this.size;
  }

  addBlock(pos: Vec3, id: string, properties: Record<string, unknown> = {}, nbt?: unknown) {
    if (!this.isInside(pos)) {
      throw new Error(`3DBLOCKS cannot add block at ${pos.join(',')} outside ${this.size.join(',')}`);
    }

    const normalized = normalizeProperties(properties);
    const key = createStateKey(id, normalized);
    let state = this.states.get(key);
    if (!state) {
      state = new BlockState(id, normalized);
      this.states.set(key, state);
    }

    const block: PlacedBlock = { pos, state, key, nbt };
    this.blocks.push(block);
    this.blockMap.set(posIndex(this.size, pos), block);
    this.addBlockToExistingChunkIndexes(block);
    return this;
  }

  addRenderableBlock(block: RenderableBlock) {
    return this.addBlock(block.pos, block.id, block.properties, block.nbt);
  }

  getBlock(pos: Vec3): PlacedBlock | null {
    if (!this.isInside(pos)) return null;
    return this.blockMap.get(posIndex(this.size, pos)) ?? null;
  }

  getBlockState(pos: Vec3) {
    return this.getBlock(pos)?.state ?? null;
  }

  getBlocks() {
    return this.blocks;
  }

  forEachBlock(callback: (block: PlacedBlock) => void) {
    for (const block of this.blocks) {
      callback(block);
    }
  }

  async forEachBlockAsync(callback: (block: PlacedBlock) => Promise<void>) {
    for (const block of this.blocks) {
      await callback(block);
    }
  }

  getChunkPositions(chunkSize: number): Vec3[] {
    return Array.from(this.getChunkIndex(chunkSize).keys()).map(parseChunkKey);
  }

  getBlocksInChunk(chunkPos: Vec3, chunkSize: number) {
    return this.getChunkIndex(chunkSize).get(chunkKey(chunkPos)) ?? [];
  }

  isInside(pos: Vec3) {
    return pos[0] >= 0 && pos[0] < this.size[0]
      && pos[1] >= 0 && pos[1] < this.size[1]
      && pos[2] >= 0 && pos[2] < this.size[2];
  }

  private getChunkIndex(chunkSize: number) {
    let index = this.chunkIndexes.get(chunkSize);
    if (index) return index;

    index = new Map<string, PlacedBlock[]>();
    for (const block of this.blocks) {
      const key = chunkKey(blockToChunk(block.pos, chunkSize));
      let bucket = index.get(key);
      if (!bucket) {
        bucket = [];
        index.set(key, bucket);
      }
      bucket.push(block);
    }
    this.chunkIndexes.set(chunkSize, index);
    return index;
  }

  private addBlockToExistingChunkIndexes(block: PlacedBlock) {
    for (const [chunkSize, index] of this.chunkIndexes) {
      const key = chunkKey(blockToChunk(block.pos, chunkSize));
      let bucket = index.get(key);
      if (!bucket) {
        bucket = [];
        index.set(key, bucket);
      }
      bucket.push(block);
    }
  }
}
