import type { JsonValue } from '../../util/Json.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtInt extends NbtTag {
    private readonly value;
    constructor(value: number);
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    getAsNumber(): number;
    toString(): string;
    toPrettyString(): string;
    toSimplifiedJson(): number;
    toJson(): number;
    toBytes(output: DataOutput): void;
    static create(): NbtInt;
    static fromJson(value: JsonValue): NbtInt;
    static fromBytes(input: DataInput): NbtInt;
}
//# sourceMappingURL=NbtInt.d.ts.map