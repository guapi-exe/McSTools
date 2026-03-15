import { Holder } from '../core/index.js';
import type { NoiseParameters, PositionalRandom } from '../math/index.js';
import { NormalNoise } from '../math/index.js';
import { DensityFunction } from './DensityFunction.js';
export interface NoiseRouter {
    barrier: DensityFunction;
    fluidLevelFloodedness: DensityFunction;
    fluidLevelSpread: DensityFunction;
    lava: DensityFunction;
    temperature: DensityFunction;
    vegetation: DensityFunction;
    continents: DensityFunction;
    erosion: DensityFunction;
    depth: DensityFunction;
    ridges: DensityFunction;
    initialDensityWithoutJaggedness: DensityFunction;
    finalDensity: DensityFunction;
    veinToggle: DensityFunction;
    veinRidged: DensityFunction;
    veinGap: DensityFunction;
}
export declare namespace NoiseRouter {
    function fromJson(obj: unknown): NoiseRouter;
    function create(router: Partial<NoiseRouter>): NoiseRouter;
    function mapAll(router: NoiseRouter, visitor: DensityFunction.Visitor): {
        barrier: DensityFunction;
        fluidLevelFloodedness: DensityFunction;
        fluidLevelSpread: DensityFunction;
        lava: DensityFunction;
        temperature: DensityFunction;
        vegetation: DensityFunction;
        continents: DensityFunction;
        erosion: DensityFunction;
        depth: DensityFunction;
        ridges: DensityFunction;
        initialDensityWithoutJaggedness: DensityFunction;
        finalDensity: DensityFunction;
        veinToggle: DensityFunction;
        veinRidged: DensityFunction;
        veinGap: DensityFunction;
    };
    function instantiate(random: PositionalRandom, noise: Holder<NoiseParameters>): NormalNoise;
}
//# sourceMappingURL=NoiseRouter.d.ts.map