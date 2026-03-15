import { Json, StringReader } from '../../util/index.js';
import { NbtParser } from '../NbtParser.js';
import { NbtByteArray } from './NbtByteArray.js';
import { NbtIntArray } from './NbtIntArray.js';
import { NbtList } from './NbtList.js';
import { NbtLongArray } from './NbtLongArray.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtCompound extends NbtTag {
    properties;
    constructor(properties) {
        super();
        this.properties = properties ?? new Map();
    }
    getId() {
        return NbtType.Compound;
    }
    equals(other) {
        return other.isCompound()
            && this.size === other.size
            && [...this.properties.entries()].every(([key, value]) => {
                const otherValue = other.properties.get(key);
                return otherValue !== undefined && value.equals(otherValue);
            });
    }
    has(key) {
        return this.properties.has(key);
    }
    hasNumber(key) {
        return this.get(key)?.isNumber() ?? false;
    }
    hasString(key) {
        return this.get(key)?.isString() ?? false;
    }
    hasList(key, type, length) {
        const tag = this.get(key);
        return (tag?.isList()
            && (type === undefined || tag.getType() === type)
            && (length === undefined || tag.length === length)) ?? false;
    }
    hasCompound(key) {
        return this.get(key)?.isCompound() ?? false;
    }
    get(key) {
        return this.properties.get(key);
    }
    getString(key) {
        return this.get(key)?.getAsString() ?? '';
    }
    getNumber(key) {
        return this.get(key)?.getAsNumber() ?? 0;
    }
    getBoolean(key) {
        return this.getNumber(key) !== 0;
    }
    getList(key, type) {
        const tag = this.get(key);
        if (tag?.isList() && (type === undefined || tag.getType() === type)) {
            return tag;
        }
        return NbtList.create();
    }
    getCompound(key) {
        const tag = this.get(key);
        if (tag?.isCompound()) {
            return tag;
        }
        return NbtCompound.create();
    }
    getByteArray(key) {
        const tag = this.get(key);
        if (tag?.isByteArray()) {
            return tag;
        }
        return NbtByteArray.create();
    }
    getIntArray(key) {
        const tag = this.get(key);
        if (tag?.isIntArray()) {
            return tag;
        }
        return NbtIntArray.create();
    }
    getLongArray(key) {
        const tag = this.get(key);
        if (tag?.isLongArray()) {
            return tag;
        }
        return NbtLongArray.create();
    }
    keys() {
        return this.properties.keys();
    }
    get size() {
        return this.properties.size;
    }
    map(fn) {
        return Object.fromEntries([...this.properties.entries()]
            .map(([key, value]) => fn(key, value, this)));
    }
    forEach(fn) {
        [...this.properties.entries()]
            .forEach(([key, value]) => fn(key, value, this));
    }
    set(key, value) {
        this.properties.set(key, value);
        return this;
    }
    delete(key) {
        return this.properties.delete(key);
    }
    clear() {
        this.properties.clear();
        return this;
    }
    toString() {
        const pairs = [];
        for (const [key, tag] of this.properties.entries()) {
            const needsQuotes = key.split('').some(c => !StringReader.isAllowedInUnquotedString(c));
            pairs.push((needsQuotes ? JSON.stringify(key) : key) + ':' + tag.toString());
        }
        return '{' + pairs.join(',') + '}';
    }
    toPrettyString(indent = '  ', depth = 0) {
        if (this.size === 0)
            return '{}';
        const i = indent.repeat(depth);
        const ii = indent.repeat(depth + 1);
        const pairs = [];
        for (const [key, tag] of this.properties.entries()) {
            const needsQuotes = key.split('').some(c => !StringReader.isAllowedInUnquotedString(c));
            pairs.push((needsQuotes ? JSON.stringify(key) : key) + ': ' + tag.toPrettyString(indent, depth + 1));
        }
        return '{\n' + pairs.map(p => ii + p).join(',\n') + '\n' + i + '}';
    }
    toSimplifiedJson() {
        return this.map((key, value) => [key, value.toSimplifiedJson()]);
    }
    toJson() {
        return this.map((key, value) => [key, {
                type: value.getId(),
                value: value.toJson(),
            }]);
    }
    toBytes(output) {
        for (const [key, tag] of this.properties.entries()) {
            const id = tag.getId();
            output.writeByte(id);
            output.writeString(key);
            tag.toBytes(output);
        }
        output.writeByte(NbtType.End);
    }
    static create() {
        return new NbtCompound();
    }
    static fromString(reader) {
        return NbtParser.readTag(reader);
    }
    static fromJson(value) {
        const properties = Json.readMap(value, e => {
            const { type, value } = Json.readObject(e) ?? {};
            const id = Json.readNumber(type);
            const tag = NbtTag.fromJson(value ?? {}, id);
            return tag;
        });
        return new NbtCompound(new Map(Object.entries(properties)));
    }
    static fromBytes(input) {
        const properties = new Map();
        while (true) {
            const id = input.readByte();
            if (id === NbtType.End)
                break;
            const key = input.readString();
            const value = NbtTag.fromBytes(input, id);
            properties.set(key, value);
        }
        return new NbtCompound(properties);
    }
}
NbtTag.register(NbtType.Compound, NbtCompound);
//# sourceMappingURL=NbtCompound.js.map