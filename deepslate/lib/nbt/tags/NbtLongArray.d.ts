import type { JsonValue } from '../../util/index.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtAbstractList } from './NbtAbstractList.js';
import type { NbtLongPair } from './NbtLong.js';
import { NbtLong } from './NbtLong.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtLongArray extends NbtAbstractList<NbtLong> {
    constructor(items?: ArrayLike<NbtLongPair | bigint | NbtLong>);
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    getType(): NbtType;
    get length(): number;
    toString(): string;
    toPrettyString(): string;
    toSimplifiedJson(): NbtLongPair[];
    toJson(): JsonValue;
    toBytes(output: DataOutput): void;
    static create(): NbtLongArray;
    static fromJson(value: JsonValue): NbtLongArray;
    static fromBytes(input: DataInput): NbtLongArray;
}
//# sourceMappingURL=NbtLongArray.d.ts.map