export class Identifier {
    namespace;
    path;
    static DEFAULT_NAMESPACE = 'minecraft';
    static SEPARATOR = ':';
    constructor(namespace, path) {
        this.namespace = namespace;
        this.path = path;
    }
    is(other) {
        return this.equals(Identifier.parse(other));
    }
    equals(other) {
        if (this === other) {
            return true;
        }
        if (!(other instanceof Identifier)) {
            return false;
        }
        return this.namespace === other.namespace && this.path === other.path;
    }
    toString() {
        return this.namespace + Identifier.SEPARATOR + this.path;
    }
    withPrefix(prefix) {
        return new Identifier(this.namespace, prefix + this.path);
    }
    static create(path) {
        return new Identifier(this.DEFAULT_NAMESPACE, path);
    }
    static parse(id) {
        const sep = id.indexOf(this.SEPARATOR);
        if (sep >= 0) {
            const namespace = sep >= 1 ? id.substring(0, sep) : this.DEFAULT_NAMESPACE;
            const path = id.substring(sep + 1);
            return new Identifier(namespace, path);
        }
        return new Identifier(this.DEFAULT_NAMESPACE, id);
    }
}
//# sourceMappingURL=Identifier.js.map