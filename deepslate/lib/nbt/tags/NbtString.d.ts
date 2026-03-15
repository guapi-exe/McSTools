import type { JsonValue } from '../../util/index.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtString extends NbtTag {
    static readonly EMPTY: NbtString;
    private readonly value;
    constructor(value: string);
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    getAsString(): string;
    toString(): string;
    toPrettyString(): string;
    toSimplifiedJson(): string;
    toJson(): string;
    toBytes(output: DataOutput): void;
    static create(): NbtString;
    static fromJson(value: JsonValue): NbtString;
    static fromBytes(input: DataInput): NbtString;
}
//# sourceMappingURL=NbtString.d.ts.map