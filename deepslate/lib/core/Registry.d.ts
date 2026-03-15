import { Holder } from './Holder.js';
import type { HolderSet } from './HolderSet.js';
import { Identifier } from './Identifier.js';
export declare class Registry<T> {
    readonly key: Identifier;
    private readonly parser?;
    static readonly REGISTRY: Registry<Registry<unknown>>;
    private readonly storage;
    private readonly builtin;
    private tags;
    constructor(key: Identifier, parser?: ((obj: unknown) => T) | undefined);
    static createAndRegister<T>(name: string, parser?: (obj: unknown) => T): Registry<T>;
    register(id: Identifier, value: T | (() => T), builtin?: boolean): Holder<T>;
    delete(id: Identifier): boolean;
    keys(): Identifier[];
    has(id: Identifier): boolean;
    get(id: Identifier): T | undefined;
    getOrThrow(id: Identifier): T & ({} | null);
    parse(obj: unknown): T;
    clear(): this;
    assign(other: Registry<T>): this;
    cloneEmpty(): Registry<T>;
    forEach(fn: (key: Identifier, value: T, registry: Registry<T>) => void): void;
    map<U>(fn: (key: Identifier, value: T, registry: Registry<T>) => U): U[];
    getTagRegistry(): Registry<HolderSet<T>>;
}
//# sourceMappingURL=Registry.d.ts.map