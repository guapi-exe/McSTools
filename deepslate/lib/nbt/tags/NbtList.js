import { Json } from '../../util/index.js';
import { NbtAbstractList } from './NbtAbstractList.js';
import { NbtCompound } from './NbtCompound.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtList extends NbtAbstractList {
    type;
    constructor(items, type) {
        super(items ?? []);
        this.type = this.items.length === 0 ? NbtType.End : (type ?? this.items[0].getId());
    }
    static make(factory, items) {
        return new NbtList(items.map(v => new factory(v)));
    }
    getId() {
        return NbtType.List;
    }
    equals(other) {
        return other.isList()
            && this.type === other.type
            && this.length === other.length
            && this.items.every((item, i) => item.equals(other.items[i]));
    }
    getType() {
        return this.type;
    }
    getNumber(index) {
        const entry = this.get(index);
        if (entry?.isNumber()) {
            return entry.getAsNumber();
        }
        return 0;
    }
    getString(index) {
        const entry = this.get(index);
        if (entry?.isString()) {
            return entry.getAsString();
        }
        return '';
    }
    getList(index, type) {
        const entry = this.get(index);
        if (entry?.isList() && entry.getType() === type) {
            return entry;
        }
        return NbtList.create();
    }
    getCompound(index) {
        const entry = this.get(index);
        if (entry?.isCompound()) {
            return entry;
        }
        return NbtCompound.create();
    }
    set(index, tag) {
        this.updateType(tag);
        super.set(index, tag);
    }
    add(tag) {
        this.updateType(tag);
        super.add(tag);
    }
    insert(index, tag) {
        this.updateType(tag);
        super.insert(index, tag);
    }
    updateType(tag) {
        if (tag.getId() === NbtType.End) {
            return;
        }
        else if (this.type === NbtType.End) {
            this.type = tag.getId();
        }
        else if (this.type !== tag.getId()) {
            throw new Error(`Trying to add tag of type ${NbtType[tag.getId()]} to list of ${NbtType[this.type]}`);
        }
    }
    clear() {
        super.clear();
        this.type = NbtType.End;
    }
    toString() {
        return '[' + this.items.map(i => i.toString()).join(',') + ']';
    }
    toPrettyString(indent = '  ', depth = 0) {
        if (this.length === 0)
            return '[]';
        const i = indent.repeat(depth);
        const ii = indent.repeat(depth + 1);
        return '[\n' + this.map(value => {
            return ii + value.toPrettyString(indent, depth + 1);
        }).join(',\n') + '\n' + i + ']';
    }
    toSimplifiedJson() {
        return this.map(e => e.toSimplifiedJson());
    }
    toJson() {
        return {
            type: this.type,
            items: this.items.map(e => e.toJson()),
        };
    }
    toBytes(output) {
        if (this.items.length === 0) {
            this.type = NbtType.End;
        }
        else {
            this.type = this.items[0].getId();
        }
        output.writeByte(this.type);
        output.writeInt(this.items.length);
        for (const tag of this.items) {
            tag.toBytes(output);
        }
    }
    static create() {
        return new NbtList();
    }
    static fromJson(value) {
        const obj = Json.readObject(value) ?? {};
        const type = Json.readNumber(obj.type) ?? NbtType.Compound;
        const items = (Json.readArray(obj.items) ?? [])
            .flatMap(v => v !== undefined ? [NbtTag.fromJson(v, type)] : []);
        return new NbtList(items, type);
    }
    static fromBytes(input) {
        const type = input.readByte();
        const length = input.readInt();
        if (type === NbtType.End && length > 0) {
            throw new Error(`Missing type on ListTag but length is ${length}`);
        }
        const items = [];
        for (let i = 0; i < length; i += 1) {
            items.push(NbtTag.fromBytes(input, type));
        }
        return new NbtList(items, type);
    }
}
NbtTag.register(NbtType.List, NbtList);
//# sourceMappingURL=NbtList.js.map