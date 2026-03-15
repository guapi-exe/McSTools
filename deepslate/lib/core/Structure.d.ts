import type { NbtCompound } from '../nbt/index.js';
import { BlockPos } from './BlockPos.js';
import { BlockState } from './BlockState.js';
import type { Identifier } from './Identifier.js';
import { Registry } from './Registry.js';
import { Rotation } from './Rotation.js';
import type { StructureProvider } from './StructureProvider.js';
declare type StoredBlock = {
    pos: BlockPos;
    state: number;
    nbt?: NbtCompound;
};
export declare type PlacedBlock = {
    pos: BlockPos;
    state: BlockState;
    nbt?: NbtCompound;
};
export declare class Structure implements StructureProvider {
    private readonly size;
    private readonly palette;
    private readonly blocks;
    static readonly REGISTRY: Registry<Structure>;
    static readonly EMPTY: Structure;
    private blocksMap;
    constructor(size: BlockPos, palette?: BlockState[], blocks?: StoredBlock[]);
    getSize(): BlockPos;
    addBlock(pos: BlockPos, name: Identifier | string, properties?: {
        [key: string]: string;
    }, nbt?: NbtCompound): this;
    getBlocks(): PlacedBlock[];
    forEachBlock(callback: (block: PlacedBlock) => void): void;
    forEachBlockAsync(callback: (block: PlacedBlock) => void | Promise<void>): Promise<void>;
    getBlock(pos: BlockPos): PlacedBlock | null;
    getBlockState(pos: BlockPos): BlockState | null;
    private toPlacedBlock;
    isInside(pos: BlockPos): boolean;
    static fromNbt(nbt: NbtCompound): Structure;
    static transform(pos: BlockPos, rotation: Rotation, pivot: BlockPos): BlockPos;
}
export {};
//# sourceMappingURL=Structure.d.ts.map