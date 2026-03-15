import { Identifier } from '../../core/index.js';
import type { BiomeSource } from './BiomeSource.js';
import type { Climate } from './Climate.js';
export declare class TheEndBiomeSource implements BiomeSource {
    private static readonly END;
    private static readonly HIGHLANDS;
    private static readonly MIDLANDS;
    private static readonly ISLANDS;
    private static readonly BARRENS;
    getBiome(x: number, y: number, z: number, climateSampler: Climate.Sampler): Identifier;
    static fromJson(obj: unknown): TheEndBiomeSource;
}
//# sourceMappingURL=TheEndBiomeSource.d.ts.map