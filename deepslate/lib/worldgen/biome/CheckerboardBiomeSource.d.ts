import { Identifier } from '../../core/index.js';
import type { BiomeSource } from './BiomeSource.js';
export declare class CheckerboardBiomeSource implements BiomeSource {
    private readonly shift;
    private readonly biomes;
    private readonly n;
    constructor(shift: number, biomes: Identifier[]);
    getBiome(x: number, y: number, z: number): Identifier;
    static fromJson(obj: unknown): CheckerboardBiomeSource;
}
//# sourceMappingURL=CheckerboardBiomeSource.d.ts.map