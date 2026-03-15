import { Json } from '../util/index.js';
import { Holder } from './Holder.js';
import { Identifier } from './Identifier.js';
export class HolderSet {
    entries;
    constructor(entries) {
        this.entries = entries;
    }
    static parser(registry, valueParser) {
        const defaultedValueParser = valueParser ?? ((obj) => Holder.reference(registry, Identifier.parse(Json.readString(obj) ?? '')));
        return (obj) => {
            if (typeof obj === 'string') {
                if (obj.startsWith('#')) {
                    return Holder.reference(registry.getTagRegistry(), Identifier.parse(obj.substring(1)));
                }
                else {
                    return Holder.direct(new HolderSet([]));
                }
            }
            else {
                return Holder.direct(new HolderSet(Json.readArray(obj, defaultedValueParser) ?? []) ?? []);
            }
        };
    }
    static fromJson(registry, obj, id) {
        const root = Json.readObject(obj) ?? {};
        const replace = Json.readBoolean(root.replace) ?? false;
        const entries = Json.readArray(root.values, (obj) => {
            var required = true;
            var id = '';
            if (typeof obj === 'string') {
                id = obj;
            }
            else {
                const entry = Json.readObject(obj) ?? {};
                required = Json.readBoolean(entry.required) ?? false;
                id = Json.readString(entry.id) ?? '';
            }
            if (id.startsWith('#')) {
                return Holder.reference(registry.getTagRegistry(), Identifier.parse(id.substring(1)), required);
            }
            else {
                return Holder.reference(registry, Identifier.parse(id), required);
            }
        }) ?? [];
        if (id && !replace && registry.getTagRegistry().has(id)) {
            entries?.push(Holder.direct(registry.getTagRegistry().get(id)));
        }
        return new HolderSet(entries);
    }
    *getEntries() {
        for (const entry of this.entries) {
            const value = entry.value();
            if (value === undefined) {
                continue;
            }
            if (value instanceof HolderSet) {
                yield* value.getEntries();
            }
            else {
                yield entry;
            }
        }
    }
}
//# sourceMappingURL=HolderSet.js.map