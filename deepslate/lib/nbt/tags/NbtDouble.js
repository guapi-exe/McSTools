import { Json } from '../../util/index.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtDouble extends NbtTag {
    value;
    constructor(value) {
        super();
        this.value = value;
    }
    getId() {
        return NbtType.Double;
    }
    equals(other) {
        return other.isDouble() && this.value === other.value;
    }
    getAsNumber() {
        return this.value;
    }
    toString() {
        if (Number.isInteger(this.value)) {
            return this.value.toFixed(1);
        }
        return this.value.toString();
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
        output.writeDouble(this.value);
    }
    static create() {
        return new NbtDouble(0);
    }
    static fromJson(value) {
        return new NbtDouble(Json.readNumber(value) ?? 0);
    }
    static fromBytes(input) {
        const value = input.readDouble();
        return new NbtDouble(value);
    }
}
NbtTag.register(NbtType.Double, NbtDouble);
//# sourceMappingURL=NbtDouble.js.map