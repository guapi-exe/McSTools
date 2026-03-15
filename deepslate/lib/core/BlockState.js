import { Json } from '../util/index.js';
import { Identifier } from './Identifier.js';
export class BlockState {
    properties;
    static AIR = new BlockState(Identifier.create('air'));
    static STONE = new BlockState(Identifier.create('stone'));
    static WATER = new BlockState(Identifier.create('water'), { level: '0' });
    static LAVA = new BlockState(Identifier.create('lava'), { level: '0' });
    name;
    constructor(name, properties = {}) {
        this.properties = properties;
        this.name = typeof name === 'string' ? Identifier.parse(name) : name;
    }
    getName() {
        return this.name;
    }
    getProperties() {
        return this.properties;
    }
    getProperty(key) {
        return this.properties[key];
    }
    isFluid() {
        return this.is(BlockState.WATER) || this.is(BlockState.LAVA);
    }
    isWaterlogged() {
        return this.is(BlockState.WATER) || this.is(BlockState.LAVA)
            || this.is('bubble_column')
            || this.is('kelp') || this.is('kelp_plant')
            || this.is('seagrass') || this.is('tall_seagrass')
            || this.properties['waterlogged'] === 'true';
    }
    equals(other) {
        if (!this.name.equals(other.name)) {
            return false;
        }
        return Object.keys(this.properties).every(p => {
            return other.properties[p] === this.properties[p];
        });
    }
    is(other) {
        if (typeof other === 'string') {
            return this.name.equals(Identifier.parse(other));
        }
        if (other instanceof Identifier) {
            return this.name.equals(other);
        }
        return this.name.equals(other.name);
    }
    toString() {
        if (Object.keys(this.properties).length === 0) {
            return this.name.toString();
        }
        return `${this.name.toString()}[${Object.entries(this.properties).map(([k, v]) => k + '=' + v).join(',')}]`;
    }
    static parse(str) {
        const stateStart = str.indexOf('[');
        if (stateStart === -1) {
            return new BlockState(str);
        }
        else {
            const blockId = str.substring(0, stateStart);
            const states = str.substring(stateStart + 1, str.length - 1).split(',');
            const properties = Object.fromEntries(states.map(e => e.split('=')));
            return new BlockState(blockId, properties);
        }
    }
    static fromNbt(nbt) {
        const name = Identifier.parse(nbt.getString('Name'));
        const properties = nbt.getCompound('Properties')
            .map((key, value) => [key, value.getAsString()]);
        return new BlockState(name, properties);
    }
    static fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const name = Identifier.parse(Json.readString(root.Name) ?? BlockState.STONE.name.toString());
        const properties = Json.readMap(root.Properties, p => Json.readString(p) ?? '');
        return new BlockState(name, properties);
    }
}
//# sourceMappingURL=BlockState.js.map