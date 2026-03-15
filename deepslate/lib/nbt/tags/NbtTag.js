import { Json, StringReader } from '../../util/index.js';
import { NbtType } from './NbtType.js';
export class NbtTag {
    static FACTORIES = new Map();
    static register(type, factory) {
        const factoryType = factory.create().getId();
        if (factoryType !== type) {
            throw new Error(`Registered factory ${NbtType[factoryType]} does not match type ${NbtType[type]}`);
        }
        NbtTag.FACTORIES.set(type, factory);
    }
    isEnd() {
        return this.getId() === NbtType.End;
    }
    isByte() {
        return this.getId() === NbtType.Byte;
    }
    isShort() {
        return this.getId() === NbtType.Short;
    }
    isInt() {
        return this.getId() === NbtType.Int;
    }
    isLong() {
        return this.getId() === NbtType.Long;
    }
    isFloat() {
        return this.getId() === NbtType.Float;
    }
    isDouble() {
        return this.getId() === NbtType.Double;
    }
    isByteArray() {
        return this.getId() === NbtType.ByteArray;
    }
    isString() {
        return this.getId() === NbtType.String;
    }
    isList() {
        return this.getId() === NbtType.List;
    }
    isCompound() {
        return this.getId() === NbtType.Compound;
    }
    isIntArray() {
        return this.getId() === NbtType.IntArray;
    }
    isLongArray() {
        return this.getId() === NbtType.LongArray;
    }
    isNumber() {
        return this.isByte() || this.isShort() || this.isInt() || this.isLong() || this.isFloat() || this.isDouble();
    }
    isArray() {
        return this.isByteArray() || this.isIntArray() || this.isLongArray();
    }
    isListOrArray() {
        return this.isList() || this.isArray();
    }
    getAsNumber() {
        return 0;
    }
    getAsString() {
        return '';
    }
    toJsonWithId() {
        return {
            type: this.getId(),
            value: this.toJson(),
        };
    }
    static getFactory(id) {
        const factory = this.FACTORIES.get(id);
        if (!factory) {
            throw new Error(`Invalid tag id ${id}`);
        }
        return factory;
    }
    static create(id) {
        return this.getFactory(id).create();
    }
    static fromString(input) {
        const reader = typeof input === 'string' ? new StringReader(input) : input;
        return this.getFactory(NbtType.Compound).fromString(reader);
    }
    static fromJson(value, id = NbtType.Compound) {
        return this.getFactory(id).fromJson(value);
    }
    static fromJsonWithId(value) {
        const obj = Json.readObject(value) ?? {};
        const id = Json.readInt(obj.type) ?? 0;
        return NbtTag.fromJson(obj.value ?? {}, id);
    }
    static fromBytes(input, id = NbtType.Compound) {
        return this.getFactory(id).fromBytes(input);
    }
}
//# sourceMappingURL=NbtTag.js.map