import { Holder } from './Holder.js';
import { Identifier } from './Identifier.js';
export class Registry {
    key;
    parser;
    static REGISTRY = new Registry(Identifier.create('root'));
    storage = new Map();
    builtin = new Map();
    tags = undefined;
    constructor(key, parser) {
        this.key = key;
        this.parser = parser;
    }
    static createAndRegister(name, parser) {
        const registry = new Registry(Identifier.create(name), parser);
        Registry.REGISTRY.register(registry.key, registry);
        return registry;
    }
    register(id, value, builtin) {
        this.storage.set(id.toString(), value);
        if (builtin) {
            this.builtin.set(id.toString(), value);
        }
        return Holder.reference(this, id);
    }
    delete(id) {
        const deleted = this.storage.delete(id.toString());
        this.builtin.delete(id.toString());
        return deleted;
    }
    keys() {
        return [...this.storage.keys()].map(e => Identifier.parse(e));
    }
    has(id) {
        return this.storage.has(id.toString());
    }
    get(id) {
        var value = this.storage.get(id.toString());
        if (value instanceof Function) {
            value = value();
            this.storage.set(id.toString(), value);
        }
        return value;
    }
    getOrThrow(id) {
        const value = this.get(id);
        if (value === undefined) {
            throw new Error(`Missing key in ${this.key.toString()}: ${id.toString()}`);
        }
        return value;
    }
    parse(obj) {
        if (!this.parser) {
            throw new Error(`No parser exists for ${this.key.toString()}`);
        }
        return this.parser(obj);
    }
    clear() {
        this.storage.clear();
        for (const [key, value] of this.builtin.entries()) {
            this.storage.set(key, value);
        }
        if (this.tags) {
            this.tags.clear();
        }
        return this;
    }
    assign(other) {
        if (!this.key.equals(other.key)) {
            throw new Error(`Cannot assign registry of type ${other.key.toString()} to registry of type ${this.key.toString()}`);
        }
        for (const key of other.keys()) {
            this.storage.set(key.toString(), other.getOrThrow(key));
        }
        return this;
    }
    cloneEmpty() {
        return new Registry(this.key, this.parser);
    }
    forEach(fn) {
        for (const [key, value] of this.storage.entries()) {
            fn(Identifier.parse(key), value instanceof Function ? value() : value, this);
        }
    }
    map(fn) {
        return [...this.storage.entries()].map(([key, value]) => {
            return fn(Identifier.parse(key), value instanceof Function ? value() : value, this);
        });
    }
    getTagRegistry() {
        if (this.tags === undefined) {
            this.tags = new Registry(new Identifier(this.key.namespace, `tags/${this.key.path}`));
        }
        return this.tags;
    }
}
//# sourceMappingURL=Registry.js.map