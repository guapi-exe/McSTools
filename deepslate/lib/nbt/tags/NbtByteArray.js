import { Json } from '../../util/index.js';
import { NbtAbstractList } from './NbtAbstractList.js';
import { NbtByte } from './NbtByte.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtByteArray extends NbtAbstractList {
    constructor(items) {
        super(Array.from(items ?? [], e => typeof e === 'number' ? new NbtByte(e) : e));
    }
    getId() {
        return NbtType.ByteArray;
    }
    equals(other) {
        return other.isByteArray()
            && this.length === other.length
            && this.items.every((item, i) => item.equals(other.items[i]));
    }
    getType() {
        return NbtType.Byte;
    }
    toString() {
        const entries = this.items.map(e => e.getAsNumber().toFixed() + 'B');
        return '[B;' + entries.join(',') + ']';
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
        output.writeBytes(this.items.map(e => e.getAsNumber()));
    }
    static create() {
        return new NbtByteArray([]);
    }
    static fromJson(value) {
        const items = Json.readArray(value, e => Json.readNumber(e) ?? 0) ?? [];
        return new NbtByteArray(items);
    }
    static fromBytes(input) {
        const length = input.readInt();
        const items = input.readBytes(length);
        return new NbtByteArray(items);
    }
}
NbtTag.register(NbtType.ByteArray, NbtByteArray);
//# sourceMappingURL=NbtByteArray.js.map