import { Identifier } from '../../core/index.js';
import { Json } from '../../util/index.js';
export class CheckerboardBiomeSource {
    shift;
    biomes;
    n;
    constructor(shift, biomes) {
        this.shift = shift;
        this.biomes = biomes;
        if (biomes.length === 0) {
            throw new Error('Cannot create checkerboard biome source without biomes');
        }
        this.n = biomes.length;
    }
    getBiome(x, y, z) {
        const i = (((x >> this.shift) + (z >> this.shift)) % this.n + this.n) % this.n;
        return Identifier.parse(this.biomes[i].toString());
    }
    static fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const scale = Json.readInt(root.scale) ?? 2;
        let biomes;
        if (typeof root.biomes === 'string') {
            biomes = [Identifier.parse(root.biomes)];
        }
        else {
            biomes = Json.readArray(root.biomes, (b) => Identifier.parse(Json.readString(b) ?? '')) ?? [];
        }
        return new CheckerboardBiomeSource(scale + 2, biomes);
    }
}
//# sourceMappingURL=CheckerboardBiomeSource.js.map