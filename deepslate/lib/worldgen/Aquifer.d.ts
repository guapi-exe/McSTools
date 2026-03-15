import { BlockState, ChunkPos } from '../core/index.js';
import type { PositionalRandom } from '../math/index.js';
import { DensityFunction } from './DensityFunction.js';
import type { NoiseChunk } from './NoiseChunk.js';
import type { NoiseRouter } from './NoiseRouter.js';
export declare class FluidStatus {
    readonly level: number;
    readonly type: BlockState;
    constructor(level: number, type: BlockState);
    at(level: number): BlockState;
}
export declare type FluidPicker = (x: number, y: number, z: number) => FluidStatus;
export interface Aquifer {
    compute(context: DensityFunction.Context, density: number): BlockState | undefined;
}
export declare namespace Aquifer {
    function createDisabled(fluidPicker: FluidPicker): Aquifer;
}
export declare class NoiseAquifer implements Aquifer {
    private readonly noiseChunk;
    private readonly router;
    private readonly random;
    private readonly globalFluidPicker;
    private static readonly X_SPACING;
    private static readonly Y_SPACING;
    private static readonly Z_SPACING;
    private static readonly SURFACE_SAMPLING;
    private readonly minGridX;
    private readonly minGridY;
    private readonly minGridZ;
    private readonly gridSizeX;
    private readonly gridSizeZ;
    private readonly gridSize;
    private readonly aquiferCache;
    private readonly aquiferLocationCache;
    constructor(noiseChunk: NoiseChunk, chunkPos: ChunkPos, router: NoiseRouter, random: PositionalRandom, minY: number, height: number, globalFluidPicker: FluidPicker);
    compute({ x, y, z }: DensityFunction.Context, density: number): BlockState | undefined;
    private static similarity;
    private calculatePressure;
    private getStatus;
    private computeStatus;
    private getFluidType;
    private getLocation;
    private getIndex;
    private gridX;
    private gridY;
    private gridZ;
}
//# sourceMappingURL=Aquifer.d.ts.map