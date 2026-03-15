import { BlockPos, ChunkPos } from '../core/index.js';
import { computeIfAbsent } from '../util/index.js';
import { Aquifer, NoiseAquifer } from './Aquifer.js';
import { DensityFunction } from './DensityFunction.js';
import { NoiseSettings } from './NoiseSettings.js';
export class NoiseChunk {
    cellCountXZ;
    cellCountY;
    cellNoiseMinY;
    minX;
    minZ;
    settings;
    cellWidth;
    cellHeight;
    firstCellX;
    firstCellZ;
    firstNoiseX;
    firstNoiseZ;
    noiseSizeXZ;
    preliminarySurfaceLevel = new Map();
    aquifer;
    materialRule;
    initialDensity;
    constructor(cellCountXZ, cellCountY, cellNoiseMinY, randomState, minX, minZ, settings, aquifersEnabled, fluidPicker) {
        this.cellCountXZ = cellCountXZ;
        this.cellCountY = cellCountY;
        this.cellNoiseMinY = cellNoiseMinY;
        this.minX = minX;
        this.minZ = minZ;
        this.settings = settings;
        this.cellWidth = NoiseSettings.cellWidth(settings);
        this.cellHeight = NoiseSettings.cellHeight(settings);
        this.firstCellX = Math.floor(minX / this.cellWidth);
        this.firstCellZ = Math.floor(minZ / this.cellWidth);
        this.firstNoiseX = minX >> 2;
        this.firstNoiseZ = minZ >> 2;
        this.noiseSizeXZ = (cellCountXZ * this.cellWidth) >> 2;
        if (!aquifersEnabled || true) { // WIP: Noise aquifers don't work yet
            this.aquifer = Aquifer.createDisabled(fluidPicker);
        }
        else {
            const chunkPos = ChunkPos.fromBlockPos(BlockPos.create(minX, 0, minZ));
            const minY = cellNoiseMinY * NoiseSettings.cellHeight(settings);
            const height = cellCountY * NoiseSettings.cellHeight(settings);
            this.aquifer = new NoiseAquifer(this, chunkPos, randomState.router, randomState.aquiferRandom, minY, height, fluidPicker);
        }
        const finalDensity = randomState.router.finalDensity;
        this.materialRule = MaterialRule.fromList([
            (context) => this.aquifer.compute(context, finalDensity.compute(context)),
        ]);
        this.initialDensity = randomState.router.initialDensityWithoutJaggedness;
    }
    getFinalState(x, y, z) {
        return this.materialRule({ x, y, z });
    }
    getPreliminarySurfaceLevel(quartX, quartZ) {
        return computeIfAbsent(this.preliminarySurfaceLevel, ChunkPos.asLong(quartX, quartZ), () => {
            const x = quartX << 2;
            const z = quartZ << 2;
            for (let y = this.settings.minY + this.settings.height; y >= this.settings.minY; y -= this.cellHeight) {
                const density = this.initialDensity.compute(DensityFunction.context(x, y, z));
                if (density > 0.390625) {
                    return y;
                }
            }
            return Number.MAX_SAFE_INTEGER;
        });
    }
}
export var MaterialRule;
(function (MaterialRule) {
    function fromList(rules) {
        return (context) => {
            for (const rule of rules) {
                const state = rule(context);
                if (state)
                    return state;
            }
            return undefined;
        };
    }
    MaterialRule.fromList = fromList;
})(MaterialRule || (MaterialRule = {}));
//# sourceMappingURL=NoiseChunk.js.map