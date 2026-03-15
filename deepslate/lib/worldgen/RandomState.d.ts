import { DensityFunction, Identifier, NoiseSettings, NormalNoise } from '../index.js';
import type { PositionalRandom } from '../math/index.js';
import { Climate } from './biome/index.js';
import type { NoiseGeneratorSettings } from './NoiseGeneratorSettings.js';
import { NoiseRouter } from './NoiseRouter.js';
import { SurfaceSystem } from './SurfaceSystem.js';
export declare class RandomState {
    readonly seed: bigint;
    private readonly noiseCache;
    private readonly randomCache;
    readonly random: PositionalRandom;
    readonly aquiferRandom: PositionalRandom;
    readonly oreRandom: PositionalRandom;
    readonly surfaceSystem: SurfaceSystem;
    readonly router: NoiseRouter;
    readonly sampler: Climate.Sampler;
    constructor(settings: NoiseGeneratorSettings, seed: bigint);
    createVisitor(noiseSettings: NoiseSettings, legacyRandom: boolean): {
        map: (fn: DensityFunction) => DensityFunction;
    };
    getOrCreateNoise(id: Identifier): NormalNoise;
    getOrCreateRandom(id: Identifier): PositionalRandom;
}
//# sourceMappingURL=RandomState.d.ts.map