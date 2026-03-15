import { Identifier, Registry } from '../core/index.js';
import { NoiseParameters } from '../math/index.js';
import { DensityFunction } from './DensityFunction.js';
import { NoiseGeneratorSettings } from './NoiseGeneratorSettings.js';
export var WorldgenRegistries;
(function (WorldgenRegistries) {
    WorldgenRegistries.NOISE = Registry.createAndRegister('worldgen/noise', NoiseParameters.fromJson);
    WorldgenRegistries.DENSITY_FUNCTION = Registry.createAndRegister('worldgen/density_function', obj => DensityFunction.fromJson(obj));
    WorldgenRegistries.NOISE_SETTINGS = Registry.createAndRegister('worldgen/noise_settings', NoiseGeneratorSettings.fromJson);
    WorldgenRegistries.BIOME = Registry.createAndRegister('worldgen/biome');
    WorldgenRegistries.SURFACE_NOISE = createNoise('surface', -6, [1, 1, 1]);
    WorldgenRegistries.SURFACE_SECONDARY_NOISE = createNoise('surface_secondary', -6, [1, 1, 0, 1]);
    function createNoise(name, firstOctave, amplitudes) {
        return WorldgenRegistries.NOISE.register(Identifier.create(name), NoiseParameters.create(firstOctave, amplitudes), true);
    }
})(WorldgenRegistries || (WorldgenRegistries = {}));
//# sourceMappingURL=WorldgenRegistries.js.map