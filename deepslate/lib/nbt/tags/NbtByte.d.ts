import type { JsonValue } from '../../util/index.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtByte extends NbtTag {
    static readonly ZERO: NbtByte;
    static readonly ONE: NbtByte;
    private readonly value;
    constructor(value: number | boolean);
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    getAsNumber(): number;
    toString(): string;
    toPrettyString(): string;
    toSimplifiedJson(): number;
    toJson(): number;
    toBytes(output: DataOutput): void;
    static create(): NbtByte;
    static fromJson(value: JsonValue): NbtByte;
    static fromBytes(input: DataInput): NbtByte;
}
//# sourceMappingURL=NbtByte.d.ts.map