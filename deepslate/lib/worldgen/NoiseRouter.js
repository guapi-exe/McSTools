import { Holder } from '../core/index.js';
import { NormalNoise } from '../math/index.js';
import { Json } from '../util/index.js';
import { DensityFunction } from './DensityFunction.js';
import { WorldgenRegistries } from './WorldgenRegistries.js';
export var NoiseRouter;
(function (NoiseRouter) {
    const fieldParser = (obj) => new DensityFunction.HolderHolder(Holder.parser(WorldgenRegistries.DENSITY_FUNCTION, DensityFunction.fromJson)(obj));
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        return {
            barrier: fieldParser(root.barrier),
            fluidLevelFloodedness: fieldParser(root.fluid_level_floodedness),
            fluidLevelSpread: fieldParser(root.fluid_level_spread),
            lava: fieldParser(root.lava),
            temperature: fieldParser(root.temperature),
            vegetation: fieldParser(root.vegetation),
            continents: fieldParser(root.continents),
            erosion: fieldParser(root.erosion),
            depth: fieldParser(root.depth),
            ridges: fieldParser(root.ridges),
            initialDensityWithoutJaggedness: fieldParser(root.initial_density_without_jaggedness),
            finalDensity: fieldParser(root.final_density),
            veinToggle: fieldParser(root.vein_toggle),
            veinRidged: fieldParser(root.vein_ridged),
            veinGap: fieldParser(root.vein_gap),
        };
    }
    NoiseRouter.fromJson = fromJson;
    function create(router) {
        return {
            barrier: DensityFunction.Constant.ZERO,
            fluidLevelFloodedness: DensityFunction.Constant.ZERO,
            fluidLevelSpread: DensityFunction.Constant.ZERO,
            lava: DensityFunction.Constant.ZERO,
            temperature: DensityFunction.Constant.ZERO,
            vegetation: DensityFunction.Constant.ZERO,
            continents: DensityFunction.Constant.ZERO,
            erosion: DensityFunction.Constant.ZERO,
            depth: DensityFunction.Constant.ZERO,
            ridges: DensityFunction.Constant.ZERO,
            initialDensityWithoutJaggedness: DensityFunction.Constant.ZERO,
            finalDensity: DensityFunction.Constant.ZERO,
            veinToggle: DensityFunction.Constant.ZERO,
            veinRidged: DensityFunction.Constant.ZERO,
            veinGap: DensityFunction.Constant.ZERO,
            ...router,
        };
    }
    NoiseRouter.create = create;
    function mapAll(router, visitor) {
        return {
            barrier: router.barrier.mapAll(visitor),
            fluidLevelFloodedness: router.fluidLevelFloodedness.mapAll(visitor),
            fluidLevelSpread: router.fluidLevelSpread.mapAll(visitor),
            lava: router.lava.mapAll(visitor),
            temperature: router.temperature.mapAll(visitor),
            vegetation: router.vegetation.mapAll(visitor),
            continents: router.continents.mapAll(visitor),
            erosion: router.erosion.mapAll(visitor),
            depth: router.depth.mapAll(visitor),
            ridges: router.ridges.mapAll(visitor),
            initialDensityWithoutJaggedness: router.initialDensityWithoutJaggedness.mapAll(visitor),
            finalDensity: router.finalDensity.mapAll(visitor),
            veinToggle: router.veinToggle.mapAll(visitor),
            veinRidged: router.veinRidged.mapAll(visitor),
            veinGap: router.veinGap.mapAll(visitor),
        };
    }
    NoiseRouter.mapAll = mapAll;
    const noiseCache = new Map();
    function instantiate(random, noise) {
        const key = noise.key()?.toString();
        if (!key) {
            throw new Error('Cannot instantiate noise from direct holder');
        }
        const randomKey = random.seedKey();
        const cached = noiseCache.get(key);
        if (cached && cached[0] === randomKey[0] && cached[1] === randomKey[1]) {
            return cached[2];
        }
        const result = new NormalNoise(random.fromHashOf(key), noise.value());
        noiseCache.set(key, [randomKey[0], randomKey[1], result]);
        return result;
    }
    NoiseRouter.instantiate = instantiate;
})(NoiseRouter || (NoiseRouter = {}));
//# sourceMappingURL=NoiseRouter.js.map