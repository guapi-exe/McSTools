import { Holder } from './Holder.js';
import { Identifier } from './Identifier.js';
import type { Registry } from './Registry.js';
export declare class HolderSet<T> {
    private readonly entries;
    constructor(entries: (Holder<T | HolderSet<T> | undefined>)[]);
    static parser<T>(registry: Registry<T>, valueParser?: (obj: unknown) => Holder<T>): (obj: unknown) => Holder<HolderSet<T>>;
    static fromJson<T>(registry: Registry<T>, obj: unknown, id?: Identifier): HolderSet<T>;
    getEntries(): Iterable<Holder<T>>;
}
//# sourceMappingURL=HolderSet.d.ts.map