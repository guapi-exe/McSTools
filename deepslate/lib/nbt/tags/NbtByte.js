import { Json } from '../../util/index.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtByte extends NbtTag {
    static ZERO = new NbtByte(0);
    static ONE = new NbtByte(1);
    value;
    constructor(value) {
        super();
        this.value = typeof value === 'number' ? value : (value ? 1 : 0);
    }
    getId() {
        return NbtType.Byte;
    }
    equals(other) {
        return other.isByte() && this.value === other.value;
    }
    getAsNumber() {
        return this.value;
    }
    toString() {
        return this.value.toFixed() + 'b';
    }
    toPrettyString() {
        return this.toString();
    }
    toSimplifiedJson() {
        return this.value;
    }
    toJson() {
        return this.value;
    }
    toBytes(output) {
        output.writeByte(this.value);
    }
    static create() {
        return NbtByte.ZERO;
    }
    static fromJson(value) {
        return new NbtByte(Json.readInt(value) ?? 0);
    }
    static fromBytes(input) {
        const value = input.readByte();
        return new NbtByte(value);
    }
}
NbtTag.register(NbtType.Byte, NbtByte);
//# sourceMappingURL=NbtByte.js.map