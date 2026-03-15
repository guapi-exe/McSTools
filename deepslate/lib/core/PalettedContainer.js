export class PalettedContainer {
    size;
    defaultValue;
    storage;
    palette;
    constructor(size, defaultValue) {
        this.size = size;
        this.defaultValue = defaultValue;
        this.storage = Array(size).fill(0);
        this.palette = [defaultValue];
    }
    index(x, y, z) {
        return (x << 8) + (y << 4) + z;
    }
    get(x, y, z) {
        const id = this.storage[this.index(x, y, z)];
        return this.palette[id];
    }
    set(x, y, z, value) {
        let id = this.palette.findIndex(b => b.equals(value));
        if (id === -1) {
            id = this.palette.length;
            this.palette.push(value);
        }
        this.storage[this.index(x, y, z)] = id;
    }
}
//# sourceMappingURL=PalettedContainer.js.map