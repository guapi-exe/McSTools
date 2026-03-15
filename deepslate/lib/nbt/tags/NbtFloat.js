import { Json } from '../../util/index.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtFloat extends NbtTag {
    value;
    constructor(value) {
        super();
        this.value = value;
    }
    getId() {
        return NbtType.Float;
    }
    equals(other) {
        return other.isFloat() && this.value === other.value;
    }
    getAsNumber() {
        return this.value;
    }
    toString() {
        return this.value.toString() + 'f';
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
        output.writeFloat(this.value);
    }
    static create() {
        return new NbtFloat(0);
    }
    static fromJson(value) {
        return new NbtFloat(Json.readNumber(value) ?? 0);
    }
    static fromBytes(input) {
        const value = input.readFloat();
        return new NbtFloat(value);
    }
}
NbtTag.register(NbtType.Float, NbtFloat);
//# sourceMappingURL=NbtFloat.js.map