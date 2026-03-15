import type { Holder } from '../core/index.js';
import { Registry } from '../core/index.js';
import { NoiseParameters } from '../math/index.js';
import { DensityFunction } from './DensityFunction.js';
import { NoiseGeneratorSettings } from './NoiseGeneratorSettings.js';
export declare namespace WorldgenRegistries {
    const NOISE: Registry<NoiseParameters>;
    const DENSITY_FUNCTION: Registry<DensityFunction>;
    const NOISE_SETTINGS: Registry<NoiseGeneratorSettings>;
    const BIOME: Registry<{}>;
    const SURFACE_NOISE: Holder<NoiseParameters>;
    const SURFACE_SECONDARY_NOISE: Holder<NoiseParameters>;
}
//# sourceMappingURL=WorldgenRegistries.d.ts.map