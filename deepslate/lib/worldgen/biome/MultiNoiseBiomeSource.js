import { Identifier } from '../../core/index.js';
import { Json } from '../../util/index.js';
import { Climate } from './Climate.js';
export class MultiNoiseBiomeSource {
    parameters;
    constructor(entries) {
        this.parameters = new Climate.Parameters(entries);
    }
    getBiome(x, y, z, climateSampler) {
        const target = climateSampler.sample(x, y, z);
        return this.parameters.find(target);
    }
    static fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const biomes = Json.readArray(root.biomes, b => (b => ({
            biome: Identifier.parse(Json.readString(b.biome) ?? 'plains'),
            parameters: Climate.ParamPoint.fromJson(b.parameters),
        }))(Json.readObject(b) ?? {})) ?? [];
        const entries = biomes.map(b => [b.parameters, () => b.biome]);
        return new MultiNoiseBiomeSource(entries);
    }
}
//# sourceMappingURL=MultiNoiseBiomeSource.js.map