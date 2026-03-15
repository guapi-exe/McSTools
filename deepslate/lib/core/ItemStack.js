import { NbtCompound, NbtInt, NbtString } from '../nbt/index.js';
import { NbtParser } from '../nbt/NbtParser.js';
import { StringReader } from '../util/index.js';
import { Identifier } from './Identifier.js';
export class ItemStack {
    id;
    count;
    components;
    constructor(id, count, components = new Map()) {
        this.id = id;
        this.count = count;
        this.components = components;
    }
    getComponent(key, baseComponents) {
        if (typeof key === 'string') {
            key = Identifier.parse(key);
        }
        if (this.components.has('!' + key.toString())) {
            return undefined;
        }
        const value = this.components.get(key.toString());
        if (value) {
            return value;
        }
        if (baseComponents) {
            return baseComponents.getItemComponents(this.id)?.get(key.toString());
        }
        return undefined;
    }
    hasComponent(key, baseComponents) {
        if (typeof key === 'string') {
            key = Identifier.parse(key);
        }
        if (this.components.has('!' + key.toString())) {
            return false;
        }
        if (this.components.has(key.toString())) {
            return true;
        }
        if (baseComponents) {
            return baseComponents.getItemComponents(this.id)?.has(key.toString());
        }
        return false;
    }
    clone() {
        // Component values are not cloned because they are assumed to be immutable
        const components = new Map(this.components);
        return new ItemStack(this.id, this.count, components);
    }
    is(other) {
        if (typeof other === 'string') {
            return this.id.equals(Identifier.parse(other));
        }
        if (other instanceof Identifier) {
            return this.id.equals(other);
        }
        return this.id.equals(other.id);
    }
    equals(other) {
        if (this === other) {
            return true;
        }
        if (!(other instanceof ItemStack)) {
            return false;
        }
        return this.count === other.count && this.isSameItemSameComponents(other);
    }
    isSameItemSameComponents(other) {
        if (!this.id.equals(other.id) || this.components.size !== other.components.size) {
            return false;
        }
        for (const [key, value] of this.components) {
            const otherValue = other.components.get(key);
            if (value.toString() !== otherValue?.toString()) {
                return false;
            }
        }
        return true;
    }
    toString() {
        let result = this.id.toString();
        if (this.components.size > 0) {
            result += `[${[...this.components.entries()].map(([k, v]) => {
                return k.startsWith('!') ? k : `${k}=${v.toString()}`;
            }).join(',')}]`;
        }
        if (this.count > 1) {
            result += ` ${this.count}`;
        }
        return result;
    }
    static fromString(string) {
        const reader = new StringReader(string);
        while (reader.canRead() && reader.peek() !== '[') {
            reader.skip();
        }
        const itemId = Identifier.parse(reader.getRead());
        if (!reader.canRead()) {
            return new ItemStack(itemId, 1);
        }
        const components = new Map();
        reader.skip();
        if (reader.peek() === ']') {
            return new ItemStack(itemId, 1, components);
        }
        do {
            if (reader.peek() === '!') {
                reader.skip();
                reader.skipWhitespace();
                const start = reader.cursor;
                while (reader.canRead() && reader.peek() !== ']' && reader.peek() !== ',') {
                    reader.skip();
                }
                components.set('!' + Identifier.parse(reader.getRead(start).trim()).toString(), new NbtCompound());
            }
            else {
                reader.skipWhitespace();
                const start = reader.cursor;
                while (reader.canRead() && reader.peek() !== '=') {
                    reader.skip();
                }
                const component = Identifier.parse(reader.getRead(start).trim()).toString();
                if (!reader.canRead())
                    break;
                reader.skip();
                reader.skipWhitespace();
                const tag = NbtParser.readTag(reader);
                components.set(component, tag);
            }
            reader.skipWhitespace();
            if (!reader.canRead())
                break;
            if (reader.peek() === ']') {
                return new ItemStack(itemId, 1, components);
            }
            if (reader.peek() !== ',') {
                throw new Error('Expected , or ]');
            }
            reader.skip();
        } while (reader.canRead());
        throw new Error('Missing closing ]');
    }
    toNbt() {
        const result = new NbtCompound()
            .set('id', new NbtString(this.id.toString()));
        if (this.count > 1) {
            result.set('count', new NbtInt(this.count));
        }
        if (this.components.size > 0) {
            result.set('components', new NbtCompound(this.components));
        }
        return result;
    }
    static fromNbt(nbt) {
        const id = Identifier.parse(nbt.getString('id'));
        const count = nbt.hasNumber('count') ? nbt.getNumber('count') : 1;
        const components = new Map(Object.entries(nbt.getCompound('components').map((key, value) => {
            if (key.startsWith('!')) {
                return ['!' + Identifier.parse(key).toString(), new NbtCompound()];
            }
            return [Identifier.parse(key).toString(), value];
        })));
        return new ItemStack(id, count, components);
    }
}
//# sourceMappingURL=ItemStack.js.map