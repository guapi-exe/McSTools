import type { NbtCompound } from '../nbt/index.js';
import type { BlockPos } from './BlockPos.js';
import type { BlockState } from './BlockState.js';
export interface StructureProvider {
    getSize(): BlockPos;
    getBlocks(): {
        pos: BlockPos;
        state: BlockState;
        nbt?: NbtCompound;
    }[];
    getBlock(pos: BlockPos): {
        pos: BlockPos;
        state: BlockState;
        nbt?: NbtCompound;
    } | null;
    forEachBlock?(callback: (block: {
        pos: BlockPos;
        state: BlockState;
        nbt?: NbtCompound;
    }) => void): void;
    forEachBlockAsync?(callback: (block: {
        pos: BlockPos;
        state: BlockState;
        nbt?: NbtCompound;
    }) => void | Promise<void>): Promise<void>;
    getBlockState?(pos: BlockPos): BlockState | null;
}
//# sourceMappingURL=StructureProvider.d.ts.map