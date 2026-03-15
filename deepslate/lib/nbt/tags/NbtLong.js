import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtLong extends NbtTag {
    static dataview = new DataView(new Uint8Array(8).buffer);
    value;
    constructor(value) {
        super();
        this.value = NbtLong.toPair(value);
    }
    static toPair(value) {
        return Array.isArray(value) ? value : NbtLong.bigintToPair(value);
    }
    static bigintToPair(value) {
        NbtLong.dataview.setBigInt64(0, value);
        return [NbtLong.dataview.getInt32(0), NbtLong.dataview.getInt32(4)];
    }
    static pairToBigint(value) {
        NbtLong.dataview.setInt32(0, Number(value[0]));
        NbtLong.dataview.setInt32(4, Number(value[1]));
        return NbtLong.dataview.getBigInt64(0);
    }
    static pairToString(value) {
        return NbtLong.pairToBigint(value).toString();
    }
    static pairToNumber(value) {
        return Number(NbtLong.pairToBigint(value));
    }
    getId() {
        return NbtType.Long;
    }
    equals(other) {
        return other.isLong()
            && this.value[0] === other.value[0]
            && this.value[1] === other.value[1];
    }
    getAsNumber() {
        return NbtLong.pairToNumber(this.value);
    }
    getAsPair() {
        return this.value;
    }
    toBigInt() {
        return NbtLong.pairToBigint(this.value);
    }
    toString() {
        return NbtLong.pairToString(this.value) + 'L';
    }
    toPrettyString() {
        return this.toString();
    }
    toSimplifiedJson() {
        return NbtLong.pairToNumber(this.value);
    }
    toJson() {
        return this.value;
    }
    toBytes(output) {
        output.writeInt(this.value[0]);
        output.writeInt(this.value[1]);
    }
    static create() {
        return new NbtLong([0, 0]);
    }
    static fromJson(value) {
        return new NbtLong(Array.isArray(value) && value.length === 2
            ? value.map(e => typeof e === 'number' ? e : 0)
            : [0, 0]);
    }
    static fromBytes(input) {
        const lo = input.readInt();
        const hi = input.readInt();
        return new NbtLong([lo, hi]);
    }
}
NbtTag.register(NbtType.Long, NbtLong);
//# sourceMappingURL=NbtLong.js.map