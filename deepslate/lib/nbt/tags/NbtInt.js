import { Json } from '../../util/Json.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtInt extends NbtTag {
    value;
    constructor(value) {
        super();
        this.value = value;
    }
    getId() {
        return NbtType.Int;
    }
    equals(other) {
        return other.isInt() && this.value === other.value;
    }
    getAsNumber() {
        return this.value;
    }
    toString() {
        return this.value.toFixed();
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
        output.writeInt(this.value);
    }
    static create() {
        return new NbtInt(0);
    }
    static fromJson(value) {
        return new NbtInt(Json.readInt(value) ?? 0);
    }
    static fromBytes(input) {
        const value = input.readInt();
        return new NbtInt(value);
    }
}
NbtTag.register(NbtType.Int, NbtInt);
//# sourceMappingURL=NbtInt.js.map