import { Identifier } from '../../core/index.js';
import { Json } from '../../util/index.js';
export class FixedBiomeSource {
    biome;
    constructor(biome) {
        this.biome = biome;
    }
    getBiome() {
        return this.biome;
    }
    static fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const biome = Identifier.parse(Json.readString(root.biome) ?? 'plains');
        return new FixedBiomeSource(biome);
    }
}
//# sourceMappingURL=FixedBiomeSource.js.map