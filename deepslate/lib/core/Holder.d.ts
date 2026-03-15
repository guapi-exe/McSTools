import { Identifier } from './Identifier.js';
import type { Registry } from './Registry.js';
export interface Holder<T> {
    value(): T;
    key(): Identifier | undefined;
}
export declare namespace Holder {
    function parser<T>(registry: Registry<T>, directParser: (obj: unknown) => T): (obj: unknown) => Holder<T>;
    function direct<T>(value: T, id?: Identifier): Holder<T>;
    function reference<T>(registry: Registry<T>, id: Identifier): Holder<T>;
    function reference<T>(registry: Registry<T>, id: Identifier, required: true): Holder<T>;
    function reference<T>(registry: Registry<T>, id: Identifier, required: boolean): Holder<T | undefined>;
}
//# sourceMappingURL=Holder.d.ts.map