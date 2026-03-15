import type { Chunk } from '../core/index.js';
import type { BiomeSource } from './biome/index.js';
import type { Heightmap } from './Heightmap.js';
import type { NoiseGeneratorSettings } from './NoiseGeneratorSettings.js';
import type { RandomState } from './RandomState.js';
export declare class NoiseChunkGenerator {
    private readonly biomeSource;
    private readonly settings;
    private readonly noiseChunkCache;
    private readonly globalFluidPicker;
    constructor(biomeSource: BiomeSource, settings: NoiseGeneratorSettings);
    getBaseHeight(blockX: number, blockZ: number, heightmap: Heightmap, randomState: RandomState): number;
    private iterateNoiseColumn;
    fill(randomState: RandomState, chunk: Chunk, onlyFirstZ?: boolean): void;
    buildSurface(randomState: RandomState, chunk: Chunk, /** @deprecated */ biome?: string): void;
    computeBiome(randomState: RandomState, quartX: number, quartY: number, quartZ: number): import("../core/Identifier.js").Identifier;
    private getOrCreateNoiseChunk;
}
//# sourceMappingURL=NoiseChunkGenerator.d.ts.map