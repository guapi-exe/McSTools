import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtShort extends NbtTag {
    value;
    constructor(value) {
        super();
        this.value = value;
    }
    getId() {
        return NbtType.Short;
    }
    equals(other) {
        return other.isShort() && this.value === other.value;
    }
    getAsNumber() {
        return this.value;
    }
    toString() {
        return this.value.toFixed() + 's';
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
        output.writeShort(this.value);
    }
    static create() {
        return new NbtShort(0);
    }
    static fromJson(value) {
        return new NbtShort(typeof value === 'number' ? Math.floor(value) : 0);
    }
    static fromBytes(input) {
        const value = input.readShort();
        return new NbtShort(value);
    }
}
NbtTag.register(NbtType.Short, NbtShort);
//# sourceMappingURL=NbtShort.js.map