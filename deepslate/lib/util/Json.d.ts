export declare type JsonValue = null | string | number | boolean | {
    [x: string]: JsonValue;
} | JsonValue[];
export declare namespace Json {
    function readNumber(obj: unknown): number | undefined;
    function readInt(obj: unknown): number | undefined;
    function readString(obj: unknown): string | undefined;
    function readBoolean(obj: unknown): boolean | undefined;
    function readObject(obj: JsonValue | undefined): {
        [x: string]: JsonValue | undefined;
    } | undefined;
    function readObject(obj: unknown): {
        [x: string]: unknown;
    } | undefined;
    function readArray<T>(obj: JsonValue | undefined, parser: (obj?: JsonValue) => T): T[] | undefined;
    function readArray<T>(obj: JsonValue | undefined): (JsonValue | undefined)[] | undefined;
    function readArray<T>(obj: unknown, parser: (obj: unknown) => T): T[] | undefined;
    function readPair<T>(obj: unknown, parser: (obj?: unknown) => T): [T, T] | undefined;
    function readMap<T>(obj: JsonValue | undefined, parser: (obj?: JsonValue) => T): {
        [x: string]: T;
    };
    function readMap<T>(obj: unknown, parser: (obj: unknown) => T): {
        [x: string]: T;
    };
    function compose<T, U>(obj: unknown, parser: ((obj: unknown) => T | undefined), mapper: (result: T) => U): U | undefined;
    function readEnum<T extends string>(obj: unknown, values: readonly T[]): T;
}
//# sourceMappingURL=Json.d.ts.map