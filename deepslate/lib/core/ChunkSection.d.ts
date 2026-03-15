import { BlockState } from './BlockState.js';
export declare class ChunkSection {
    readonly minY: number;
    static readonly WIDTH = 16;
    static readonly SIZE: number;
    private readonly states;
    constructor(minY: number);
    get minBlockY(): number;
    getBlockState(x: number, y: number, z: number): BlockState;
    setBlockState(x: number, y: number, z: number, state: BlockState): void;
}
//# sourceMappingURL=ChunkSection.d.ts.map