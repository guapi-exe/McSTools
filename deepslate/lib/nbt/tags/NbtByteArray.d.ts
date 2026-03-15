import type { JsonValue } from '../../util/index.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtAbstractList } from './NbtAbstractList.js';
import { NbtByte } from './NbtByte.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtByteArray extends NbtAbstractList<NbtByte> {
    constructor(items?: ArrayLike<number | NbtByte>);
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    getType(): NbtType;
    toString(): string;
    toPrettyString(): string;
    toSimplifiedJson(): number[];
    toJson(): JsonValue;
    toBytes(output: DataOutput): void;
    static create(): NbtByteArray;
    static fromJson(value: JsonValue): NbtByteArray;
    static fromBytes(input: DataInput): NbtByteArray;
}
//# sourceMappingURL=NbtByteArray.d.ts.map