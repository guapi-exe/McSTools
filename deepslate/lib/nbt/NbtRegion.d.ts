import type { JsonValue } from '../util/index.js';
import type { NbtChunkResolver } from './NbtChunk.js';
import { NbtChunk } from './NbtChunk.js';
declare abstract class NbtAbstractRegion<T extends {
    x: number;
    z: number;
}> {
    protected readonly chunks: (T | undefined)[];
    constructor(chunks: T[]);
    getChunkPositions(): [number, number][];
    getChunk(index: number): T | undefined;
    findChunk(x: number, z: number): T | undefined;
    getFirstChunk(): T | undefined;
    filter(predicate: (chunk: T) => boolean): T[];
    map<U>(mapper: (chunk: T) => U): U[];
}
export declare class NbtRegion extends NbtAbstractRegion<NbtChunk> {
    constructor(chunks: NbtChunk[]);
    write(): Uint8Array;
    static read(array: Uint8Array): NbtRegion;
    static getIndex(x: number, z: number): number;
    toJson(): JsonValue;
    static fromJson(value: JsonValue, chunkResolver: NbtChunkResolver): NbtRegion.Ref;
}
export declare namespace NbtRegion {
    class Ref extends NbtAbstractRegion<NbtChunk.Ref> {
    }
}
export {};
//# sourceMappingURL=NbtRegion.d.ts.map