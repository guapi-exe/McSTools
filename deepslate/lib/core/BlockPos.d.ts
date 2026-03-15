import { NbtInt, NbtList } from '../nbt/index.js';
import { Direction } from './Direction.js';
export declare type BlockPos = [number, number, number];
export declare namespace BlockPos {
    function create(x: number, y: number, z: number): BlockPos;
    const ZERO: BlockPos;
    function offset(pos: BlockPos, dx: number, dy: number, dz: number): BlockPos;
    function subtract(pos: BlockPos, other: BlockPos): BlockPos;
    function add(pos: BlockPos, other: BlockPos): BlockPos;
    function towards(pos: BlockPos, dir: Direction): BlockPos;
    function equals(a: BlockPos, b: BlockPos): boolean;
    function magnitude(pos: BlockPos): number;
    function toNbt(pos: BlockPos): NbtList<NbtInt>;
    function fromNbt(nbt: NbtList): [number, number, number];
    function fromJson(obj: unknown): BlockPos;
}
//# sourceMappingURL=BlockPos.d.ts.map