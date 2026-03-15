import type { BlockPos } from './BlockPos.js';
export declare type ChunkPos = [number, number];
export declare namespace ChunkPos {
    function create(x: number, z: number): ChunkPos;
    function fromBlockPos(blockPos: BlockPos): ChunkPos;
    function fromLong(long: bigint): ChunkPos;
    function toLong(chunkPos: ChunkPos): bigint;
    function asLong(x: number, z: number): bigint;
    function minBlockX(chunkPos: ChunkPos): number;
    function minBlockZ(chunkPos: ChunkPos): number;
    function maxBlockX(chunkPos: ChunkPos): number;
    function maxBlockZ(chunkPos: ChunkPos): number;
}
//# sourceMappingURL=ChunkPos.d.ts.map