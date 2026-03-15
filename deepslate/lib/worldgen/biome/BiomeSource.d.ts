import { BlockPos, Identifier } from '../../core/index.js';
import type { Random } from '../../math/index.js';
import type { Climate } from './Climate.js';
export interface BiomeSource {
    getBiome(x: number, y: number, z: number, climateSampler: Climate.Sampler): Identifier;
}
export declare namespace BiomeSource {
    function fromJson(obj: unknown): BiomeSource;
    function findBiomeHorizontal(biomeSource: BiomeSource, centerX: number, y: number, centerZ: number, range: number, predicate: (biome: Identifier) => boolean, random: Random, sampler: Climate.Sampler, step?: number, searchFromCenter?: boolean): {
        pos: BlockPos;
        biome: Identifier;
    } | undefined;
}
//# sourceMappingURL=BiomeSource.d.ts.map