import type { BlockState } from '../core/index.js';
import type { FluidPicker } from './Aquifer.js';
import { DensityFunction } from './DensityFunction.js';
import { NoiseSettings } from './NoiseSettings.js';
import type { RandomState } from './RandomState.js';
export declare class NoiseChunk {
    readonly cellCountXZ: number;
    readonly cellCountY: number;
    readonly cellNoiseMinY: number;
    readonly minX: number;
    readonly minZ: number;
    readonly settings: NoiseSettings;
    readonly cellWidth: number;
    readonly cellHeight: number;
    readonly firstCellX: number;
    readonly firstCellZ: number;
    readonly firstNoiseX: number;
    readonly firstNoiseZ: number;
    readonly noiseSizeXZ: number;
    private readonly preliminarySurfaceLevel;
    private readonly aquifer;
    private readonly materialRule;
    private readonly initialDensity;
    constructor(cellCountXZ: number, cellCountY: number, cellNoiseMinY: number, randomState: RandomState, minX: number, minZ: number, settings: NoiseSettings, aquifersEnabled: boolean, fluidPicker: FluidPicker);
    getFinalState(x: number, y: number, z: number): BlockState | undefined;
    getPreliminarySurfaceLevel(quartX: number, quartZ: number): number;
}
export declare type MaterialRule = (context: DensityFunction.Context) => BlockState | undefined;
export declare namespace MaterialRule {
    function fromList(rules: MaterialRule[]): MaterialRule;
}
//# sourceMappingURL=NoiseChunk.d.ts.map