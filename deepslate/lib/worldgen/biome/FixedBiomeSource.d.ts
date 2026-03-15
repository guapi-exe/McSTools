import { Identifier } from '../../core/index.js';
import type { BiomeSource } from './BiomeSource.js';
export declare class FixedBiomeSource implements BiomeSource {
    private readonly biome;
    constructor(biome: Identifier);
    getBiome(): Identifier;
    static fromJson(obj: unknown): FixedBiomeSource;
}
//# sourceMappingURL=FixedBiomeSource.d.ts.map