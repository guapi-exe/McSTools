import { NbtTag } from './NbtTag.js';
export class NbtAbstractList extends NbtTag {
    items;
    constructor(items) {
        super();
        this.items = items;
    }
    getItems() {
        return this.items.slice(0);
    }
    getAsTuple(length, mapper) {
        return [...Array(length)].map((_, i) => mapper(this.items[i]));
    }
    get(index) {
        index = Math.floor(index);
        if (index < 0 || index >= this.items.length) {
            return undefined;
        }
        return this.items[index];
    }
    get length() {
        return this.items.length;
    }
    map(fn) {
        return this.items.map(fn);
    }
    filter(fn) {
        return this.items.filter(fn);
    }
    forEach(fn) {
        this.items.forEach(fn);
    }
    set(index, tag) {
        this.items[index] = tag;
    }
    add(tag) {
        this.items.push(tag);
    }
    insert(index, tag) {
        this.items.splice(index, 0, tag);
    }
    delete(index) {
        this.items.splice(index, 1);
    }
    clear() {
        this.items = [];
    }
}
//# sourceMappingURL=NbtAbstractList.js.map