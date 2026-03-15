import { NbtTag } from './NbtTag.js';
export declare abstract class NbtAbstractList<T extends NbtTag> extends NbtTag {
    protected items: T[];
    constructor(items: T[]);
    abstract getType(): number;
    getItems(): T[];
    getAsTuple<U>(length: 1, mapper: (t?: T) => U): [U];
    getAsTuple<U>(length: 2, mapper: (t?: T) => U): [U, U];
    getAsTuple<U>(length: 3, mapper: (t?: T) => U): [U, U, U];
    getAsTuple<U>(length: 4, mapper: (t?: T) => U): [U, U, U, U];
    get(index: number): T | undefined;
    get length(): number;
    map<U>(fn: (value: T, index: number) => U): U[];
    filter(fn: (value: T, index: number) => boolean): T[];
    forEach(fn: (entry: T, index: number) => void): void;
    set(index: number, tag: T): void;
    add(tag: T): void;
    insert(index: number, tag: T): void;
    delete(index: number): void;
    clear(): void;
}
//# sourceMappingURL=NbtAbstractList.d.ts.map