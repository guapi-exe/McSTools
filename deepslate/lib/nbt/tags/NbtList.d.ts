import type { JsonValue } from '../../util/index.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtAbstractList } from './NbtAbstractList.js';
import type { NbtByte } from './NbtByte.js';
import type { NbtByteArray } from './NbtByteArray.js';
import { NbtCompound } from './NbtCompound.js';
import type { NbtDouble } from './NbtDouble.js';
import type { NbtFloat } from './NbtFloat.js';
import type { NbtInt } from './NbtInt.js';
import type { NbtIntArray } from './NbtIntArray.js';
import type { NbtLong } from './NbtLong.js';
import type { NbtLongArray } from './NbtLongArray.js';
import type { NbtShort } from './NbtShort.js';
import type { NbtString } from './NbtString.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtList<T extends NbtTag = NbtTag> extends NbtAbstractList<T> {
    private type;
    constructor(items?: T[], type?: number);
    static make<U extends NbtTag, V>(factory: {
        new (v: V): U;
    }, items: V[]): NbtList<U>;
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    getType(): number;
    getNumber(index: number): number;
    getString(index: number): string;
    getList(index: number, type: NbtType.Byte): NbtList<NbtByte>;
    getList(index: number, type: NbtType.Short): NbtList<NbtShort>;
    getList(index: number, type: NbtType.Int): NbtList<NbtInt>;
    getList(index: number, type: NbtType.Long): NbtList<NbtLong>;
    getList(index: number, type: NbtType.Float): NbtList<NbtFloat>;
    getList(index: number, type: NbtType.Double): NbtList<NbtDouble>;
    getList(index: number, type: NbtType.ByteArray): NbtList<NbtByteArray>;
    getList(index: number, type: NbtType.String): NbtList<NbtString>;
    getList(index: number, type: NbtType.List): NbtList<NbtList>;
    getList(index: number, type: NbtType.Compound): NbtList<NbtCompound>;
    getList(index: number, type: NbtType.IntArray): NbtList<NbtIntArray>;
    getList(index: number, type: NbtType.LongArray): NbtList<NbtLongArray>;
    getCompound(index: number): NbtCompound;
    set(index: number, tag: T): void;
    add(tag: T): void;
    insert(index: number, tag: T): void;
    private updateType;
    clear(): void;
    toString(): string;
    toPrettyString(indent?: string, depth?: number): string;
    toSimplifiedJson(): JsonValue[];
    toJson(): {
        type: number;
        items: JsonValue[];
    };
    toBytes(output: DataOutput): void;
    static create(): NbtList<NbtTag>;
    static fromJson(value: JsonValue): NbtList<NbtTag>;
    static fromBytes(input: DataInput): NbtList<NbtTag>;
}
//# sourceMappingURL=NbtList.d.ts.map