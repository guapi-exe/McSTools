import type { JsonValue } from '../../util/index.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtAbstractList } from './NbtAbstractList.js';
import { NbtInt } from './NbtInt.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtIntArray extends NbtAbstractList<NbtInt> {
    constructor(items?: ArrayLike<number | NbtInt>);
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    getType(): NbtType;
    get length(): number;
    toString(): string;
    toPrettyString(): string;
    toSimplifiedJson(): number[];
    toJson(): JsonValue;
    toBytes(output: DataOutput): void;
    static create(): NbtIntArray;
    static fromJson(value: JsonValue): NbtIntArray;
    static fromBytes(input: DataInput): NbtIntArray;
}
//# sourceMappingURL=NbtIntArray.d.ts.map