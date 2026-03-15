import { Json } from '../../util/index.js';
import { NbtAbstractList } from './NbtAbstractList.js';
import { NbtLong } from './NbtLong.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtLongArray extends NbtAbstractList {
    constructor(items) {
        super(Array.from(items ?? [], e => typeof e === 'bigint' || Array.isArray(e) ? new NbtLong(e) : e));
    }
    getId() {
        return NbtType.LongArray;
    }
    equals(other) {
        return other.isLongArray()
            && this.length === other.length
            && this.items.every((item, i) => item.equals(other.items[i]));
    }
    getType() {
        return NbtType.Long;
    }
    get length() {
        return this.items.length;
    }
    toString() {
        const entries = this.items.map(e => e.toString());
        return '[I;' + entries.join(',') + ']';
    }
    toPrettyString() {
        return this.toString();
    }
    toSimplifiedJson() {
        return this.items.map(e => e.getAsPair());
    }
    toJson() {
        return this.items.map(e => e.getAsPair());
    }
    toBytes(output) {
        output.writeInt(this.items.length);
        for (const entry of this.items) {
            const [hi, lo] = entry.getAsPair();
            output.writeInt(hi);
            output.writeInt(lo);
        }
    }
    static create() {
        return new NbtLongArray();
    }
    static fromJson(value) {
        const items = Json.readArray(value, e => Json.readPair(e, f => Json.readNumber(f) ?? 0) ?? [0, 0]) ?? [];
        return new NbtLongArray(items);
    }
    static fromBytes(input) {
        const length = input.readInt();
        const items = [];
        for (let i = 0; i < length; i += 1) {
            items.push([input.readInt(), input.readInt()]);
        }
        return new NbtLongArray(items);
    }
}
NbtTag.register(NbtType.LongArray, NbtLongArray);
//# sourceMappingURL=NbtLongArray.js.map