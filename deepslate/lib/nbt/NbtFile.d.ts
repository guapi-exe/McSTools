import type { JsonValue } from '../util/index.js';
import { NbtCompound } from './tags/NbtCompound.js';
export declare type NbtCompressionMode = 'gzip' | 'zlib' | 'none';
export interface NbtCreateOptions {
    name?: string;
    compression?: NbtCompressionMode;
    littleEndian?: boolean;
    bedrockHeader?: number | boolean;
}
export declare class NbtFile {
    name: string;
    root: NbtCompound;
    compression: NbtCompressionMode;
    readonly littleEndian: boolean;
    readonly bedrockHeader: number | undefined;
    private static readonly DEFAULT_NAME;
    private static readonly DEFAULT_BEDROCK_HEADER;
    constructor(name: string, root: NbtCompound, compression: NbtCompressionMode, littleEndian: boolean, bedrockHeader: number | undefined);
    private writeNamedTag;
    write(): Uint8Array;
    private static readNamedTag;
    static create(options?: NbtCreateOptions): NbtFile;
    static read(array: Uint8Array, options?: NbtCreateOptions): NbtFile;
    toJson(): JsonValue;
    static fromJson(value: JsonValue): NbtFile;
}
//# sourceMappingURL=NbtFile.d.ts.map