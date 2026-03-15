import type { JsonValue } from '../../util/index.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtDouble extends NbtTag {
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
    static create(): NbtDouble;
    static fromJson(value: JsonValue): NbtDouble;
    static fromBytes(input: DataInput): NbtDouble;
}
//# sourceMappingURL=NbtDouble.d.ts.map