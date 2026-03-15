import { Json } from '../../util/index.js';
import { NbtAbstractList } from './NbtAbstractList.js';
import { NbtInt } from './NbtInt.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtIntArray extends NbtAbstractList {
    constructor(items) {
        super(Array.from(items ?? [], e => typeof e === 'number' ? new NbtInt(e) : e));
    }
    getId() {
        return NbtType.IntArray;
    }
    equals(other) {
        return other.isIntArray()
            && this.length === other.length
            && this.items.every((item, i) => item.equals(other.items[i]));
    }
    getType() {
        return NbtType.Int;
    }
    get length() {
        return this.items.length;
    }
    toString() {
        const entries = this.items.map(e => e.getAsNumber().toFixed());
        return '[I;' + entries.join(',') + ']';
    }
    toPrettyString() {
        return this.toString();
    }
    toSimplifiedJson() {
        return this.items.map(e => e.getAsNumber());
    }
    toJson() {
        return this.items.map(e => e.getAsNumber());
    }
    toBytes(output) {
        output.writeInt(this.items.length);
        for (const entry of this.items) {
            output.writeInt(entry.getAsNumber());
        }
    }
    static create() {
        return new NbtIntArray();
    }
    static fromJson(value) {
        const items = Json.readArray(value, e => Json.readNumber(e) ?? 0) ?? [];
        return new NbtIntArray(items);
    }
    static fromBytes(input) {
        const length = input.readInt();
        const items = [];
        for (let i = 0; i < length; i += 1) {
            items.push(input.readInt());
        }
        return new NbtIntArray(items);
    }
}
NbtTag.register(NbtType.IntArray, NbtIntArray);
//# sourceMappingURL=NbtIntArray.js.map