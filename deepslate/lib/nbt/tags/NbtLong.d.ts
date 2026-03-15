import type { JsonValue } from '../../util/index.js';
import type { DataInput, DataOutput } from '../io/index.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare type NbtLongPair = [number, number];
export declare class NbtLong extends NbtTag {
    private static readonly dataview;
    private readonly value;
    constructor(value: NbtLongPair | bigint);
    static toPair(value: NbtLongPair | bigint): NbtLongPair;
    static bigintToPair(value: bigint): NbtLongPair;
    static pairToBigint(value: NbtLongPair): bigint;
    static pairToString(value: NbtLongPair): string;
    static pairToNumber(value: NbtLongPair): number;
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    getAsNumber(): number;
    getAsPair(): NbtLongPair;
    toBigInt(): bigint;
    toString(): string;
    toPrettyString(): string;
    toSimplifiedJson(): number;
    toJson(): NbtLongPair;
    toBytes(output: DataOutput): void;
    static create(): NbtLong;
    static fromJson(value: JsonValue): NbtLong;
    static fromBytes(input: DataInput): NbtLong;
}
//# sourceMappingURL=NbtLong.d.ts.map