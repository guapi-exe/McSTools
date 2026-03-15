import type { JsonValue } from '../util/index.js';
import type { NbtCompressionMode } from './NbtFile.js';
import { NbtFile } from './NbtFile.js';
import type { NbtCompound } from './tags/NbtCompound.js';
export declare type NbtChunkResolver = (x: number, z: number) => Promise<NbtFile>;
export declare class NbtChunk {
    readonly x: number;
    readonly z: number;
    compression: number;
    timestamp: number;
    private raw;
    private file?;
    private dirty;
    constructor(x: number, z: number, compression: number, timestamp: number, raw: Uint8Array);
    getCompression(): NbtCompressionMode;
    setCompression(compression: NbtCompressionMode): void;
    getFile(): NbtFile;
    getRoot(): NbtCompound;
    setRoot(root: NbtCompound): void;
    markDirty(): void;
    getRaw(): Uint8Array;
    toJson(): {
        x: number;
        z: number;
        compression: number;
        timestamp: number;
        size: number;
    };
    toRef(resolver: NbtChunkResolver): NbtChunk.Ref;
    static create(x: number, z: number, file: NbtFile, timestamp?: number): NbtChunk;
    static fromJson(value: JsonValue, resolver: NbtChunkResolver): NbtChunk.Ref;
}
export declare namespace NbtChunk {
    class Ref {
        readonly x: number;
        readonly z: number;
        readonly compression: number;
        readonly timestamp: number;
        readonly size: number;
        readonly resolver: NbtChunkResolver;
        private file?;
        constructor(x: number, z: number, compression: number, timestamp: number, size: number, resolver: NbtChunkResolver);
        getFile(): NbtFile | undefined;
        getRoot(): NbtCompound | undefined;
        getFileAsync(): Promise<NbtFile>;
        getRootAsync(): Promise<NbtCompound>;
        isResolved(): boolean;
    }
}
//# sourceMappingURL=NbtChunk.d.ts.map