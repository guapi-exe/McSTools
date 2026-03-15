import type { BlockPos } from './BlockPos.js';
import { BlockState } from './BlockState.js';
import type { ChunkPos } from './ChunkPos.js';
import { ChunkSection } from './ChunkSection.js';
export declare class Chunk {
    readonly minY: number;
    readonly height: number;
    readonly pos: ChunkPos;
    sections: ChunkSection[];
    constructor(minY: number, height: number, pos: ChunkPos);
    get maxY(): number;
    get minSection(): number;
    get maxSection(): number;
    get sectionsCount(): number;
    getSectionIndex(y: number): number;
    getBlockState(pos: BlockPos): BlockState;
    setBlockState(pos: BlockPos, state: BlockState): void;
    getOrCreateSection(index: number): ChunkSection;
}
//# sourceMappingURL=Chunk.d.ts.map