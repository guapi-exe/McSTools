import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtString extends NbtTag {
    static EMPTY = new NbtString('');
    value;
    constructor(value) {
        super();
        this.value = value;
    }
    getId() {
        return NbtType.String;
    }
    equals(other) {
        return other.isString() && this.value === other.value;
    }
    getAsString() {
        return this.value;
    }
    toString() {
        return '"' + this.value.replace(/(\\|")/g, '\\$1') + '"';
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
        output.writeString(this.value);
    }
    static create() {
        return NbtString.EMPTY;
    }
    static fromJson(value) {
        return new NbtString(typeof value === 'string' ? value : '');
    }
    static fromBytes(input) {
        const value = input.readString();
        return new NbtString(value);
    }
}
NbtTag.register(NbtType.String, NbtString);
//# sourceMappingURL=NbtString.js.map