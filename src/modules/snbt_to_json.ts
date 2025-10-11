import {parse, toSNBT} from './nbt/snbt.ts';
import {toast} from "./others.ts";
import {Tag, Byte, Float, Int, Short, TagObject} from "./nbt/tag.ts";

export const parseSNBT = (snbt: string): Tag => {
    try {
        return parse(snbt)
    } catch (e) {
        console.log(e)
        toast.error(`发生了一个错误:${e}`, {
            timeout: 3000
        });
    }
};

export const encodeJSON = (tag: Tag): string => {
    try {
        return toSNBT(tag)
    } catch (e) {
        console.log(e)
        toast.error(`发生了一个错误:${e}`, {
            timeout: 3000
        });
    }
}

export function parseSNBTWithBigIntToString(snbtStr: string) {
    const parsed = parseSNBT(snbtStr);
    return replaceBigIntWithString(parsed);
}

export function replaceBigIntWithString(obj: Tag): any {
    if (obj === null || obj === undefined) return obj;

    if (
        obj instanceof Byte ||
        obj instanceof Short ||
        obj instanceof Int ||
        obj instanceof Float ||
        typeof obj === "number" ||
        typeof obj === "string"
    ) {
        return obj;
    }

    if (typeof obj === "bigint") {
        return obj.toString() + "l";
    }

    if (obj instanceof Uint8Array || obj instanceof Int8Array || obj instanceof Int32Array) {
        return [...obj];
    }

    if (obj instanceof BigInt64Array) {
        return {
            _nbtType: "BigInt64Array",
            _values: Array.from(obj, v => v.toString() + "l")
        };
    }

    if (Array.isArray(obj)) {
        return obj.map(replaceBigIntWithString);
    }

    if (obj instanceof Map) {
        const newMap = new Map<string, any>();
        for (const [k, v] of obj.entries()) {
            newMap.set(k, replaceBigIntWithString(v));
        }
        return newMap;
    }

    if (typeof obj === "object") {
        const result: TagObject = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = replaceBigIntWithString(v as Tag);
        }
        return result;
    }

    return obj;
}


export function restoreStringToBigInt(obj: any): Tag {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === "string" && /^-?\d+l$/.test(obj)) {
        return BigInt(obj.slice(0, -1));
    }

    if (obj && obj._nbtType === "BigInt64Array" && Array.isArray(obj._values)) {
        return new BigInt64Array(obj._values.map((v: string) => BigInt(v.slice(0, -1))));
    }

    if (obj instanceof Uint8Array || obj instanceof Int8Array || obj instanceof Int32Array) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(restoreStringToBigInt);
    }

    if (obj instanceof Map) {
        const newMap = new Map<string, Tag>();
        for (const [k, v] of obj.entries()) {
            newMap.set(k, restoreStringToBigInt(v));
        }
        return newMap;
    }

    if (typeof obj === "object") {
        const result: TagObject = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = restoreStringToBigInt(v);
        }
        return result;
    }

    return obj;
}



