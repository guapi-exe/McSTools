export enum TagType {
    End = 0,
    Byte = 1,
    Short = 2,
    Int = 3,
    Long = 4,
    Float = 5,
    Double = 6,
    ByteArray = 7,
    String = 8,
    List = 9,
    Compound = 10,
    IntArray = 11,
    LongArray = 12
}

// 基本 NBT 类型类
export class Byte {
    value: number;
    constructor(value: number) {
        this.value = value;
    }
    valueOf(): number { return this.value; }
}

export class Short {
    value: number;
    constructor(value: number) {
        this.value = value;
    }
    valueOf(): number { return this.value; }
}

export class Int {
    value: number;
    constructor(value: number) {
        this.value = value;
    }
    valueOf(): number { return this.value; }
}

export class Float {
    value: number;
    constructor(value: number) {
        this.value = value;
    }
    valueOf(): number { return this.value; }
}

// Tag 类型联合
export type Tag =
    | number
    | string
    | bigint
    | Byte
    | Short
    | Int
    | Float
    | Uint8Array
    | Int8Array
    | Int32Array
    | BigInt64Array
    | TagArray
    | TagObject
    | TagMap;

// Tag 数组接口
export interface TagArray extends Array<Tag> {}

// Tag 对象接口
export interface TagObject {
    [key: string]: Tag | undefined | null;
}

// Tag Map 接口
export interface TagMap extends Map<string, Tag> {}

// 获取 NBT Tag 类型
export function getTagType(tag: Tag): TagType {
    if (tag instanceof Byte) return TagType.Byte;
    if (tag instanceof Short) return TagType.Short;
    if (tag instanceof Int) return TagType.Int;
    if (typeof tag === "bigint") return TagType.Long;
    if (tag instanceof Float) return TagType.Float;
    if (typeof tag === "number") return TagType.Double;
    if (tag instanceof Uint8Array || tag instanceof Int8Array) return TagType.ByteArray;
    if (typeof tag === "string") return TagType.String;
    if (tag instanceof Array) return TagType.List;
    if (tag.constructor === Object || tag instanceof Map) return TagType.Compound;
    if (tag instanceof Int32Array) return TagType.IntArray;
    if (tag instanceof BigInt64Array) return TagType.LongArray;

    throw new Error("Invalid tag value");
}
