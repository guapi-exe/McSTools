import { Identifier } from '../../core/index.js';
import type { BiomeSource } from './BiomeSource.js';
import { Climate } from './Climate.js';
export declare class MultiNoiseBiomeSource implements BiomeSource {
    private readonly parameters;
    constructor(entries: Array<[Climate.ParamPoint, () => Identifier]>);
    getBiome(x: number, y: number, z: number, climateSampler: Climate.Sampler): Identifier;
    static fromJson(obj: unknown): MultiNoiseBiomeSource;
}
//# sourceMappingURL=MultiNoiseBiomeSource.d.ts.map