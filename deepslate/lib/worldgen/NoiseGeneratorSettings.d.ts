import { BlockState } from '../core/index.js';
import { NoiseRouter } from './NoiseRouter.js';
import { NoiseSettings } from './NoiseSettings.js';
import { SurfaceRule } from './SurfaceSystem.js';
export interface NoiseGeneratorSettings {
    noise: NoiseSettings;
    surfaceRule: SurfaceRule;
    defaultBlock: BlockState;
    defaultFluid: BlockState;
    noiseRouter: NoiseRouter;
    seaLevel: number;
    disableMobGeneration: boolean;
    aquifersEnabled: boolean;
    oreVeinsEnabled: boolean;
    legacyRandomSource: boolean;
}
export declare namespace NoiseGeneratorSettings {
    function fromJson(obj: unknown): NoiseGeneratorSettings;
    function create(settings: Partial<NoiseGeneratorSettings>): NoiseGeneratorSettings;
}
//# sourceMappingURL=NoiseGeneratorSettings.d.ts.map