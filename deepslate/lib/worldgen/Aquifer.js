import { BlockPos, BlockState, ChunkPos } from '../core/index.js';
import { clamp, clampedMap, map } from '../math/index.js';
import { lazy } from '../util/index.js';
import { DensityFunction } from './DensityFunction.js';
export class FluidStatus {
    level;
    type;
    constructor(level, type) {
        this.level = level;
        this.type = type;
    }
    at(level) {
        return level < this.level ? this.type : BlockState.AIR;
    }
}
export var Aquifer;
(function (Aquifer) {
    function createDisabled(fluidPicker) {
        return {
            compute({ x, y, z }, density) {
                if (density > 0) {
                    return undefined;
                }
                return fluidPicker(x, y, z).at(y);
            },
        };
    }
    Aquifer.createDisabled = createDisabled;
})(Aquifer || (Aquifer = {}));
export class NoiseAquifer {
    noiseChunk;
    router;
    random;
    globalFluidPicker;
    static X_SPACING = 16;
    static Y_SPACING = 12;
    static Z_SPACING = 16;
    static SURFACE_SAMPLING = [[-2, -1], [-1, -1], [0, -1], [1, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [-2, 1], [-1, 1], [0, 1], [1, 1]];
    minGridX;
    minGridY;
    minGridZ;
    gridSizeX;
    gridSizeZ;
    gridSize;
    aquiferCache;
    aquiferLocationCache;
    constructor(noiseChunk, chunkPos, router, random, minY, height, globalFluidPicker) {
        this.noiseChunk = noiseChunk;
        this.router = router;
        this.random = random;
        this.globalFluidPicker = globalFluidPicker;
        this.minGridX = this.gridX(ChunkPos.minBlockX(chunkPos)) - 1;
        this.gridSizeX = this.gridX(ChunkPos.maxBlockX(chunkPos)) + 1 - this.minGridX + 1;
        this.minGridY = this.gridY(minY) - 1;
        this.minGridZ = this.gridZ(ChunkPos.minBlockZ(chunkPos)) - 1;
        this.gridSizeZ = this.gridZ(ChunkPos.maxBlockZ(chunkPos)) + 1 - this.minGridZ + 1;
        const gridSizeY = this.gridY(minY + height) + 1 - this.minGridY + 1;
        this.gridSize = this.gridSizeX * gridSizeY * this.gridSizeZ;
        this.aquiferCache = Array(this.gridSize).fill(undefined);
        this.aquiferLocationCache = Array(this.gridSize).fill(BlockPos.ZERO);
    }
    compute({ x, y, z }, density) {
        if (density <= 0) {
            if (this.globalFluidPicker(x, y, z).at(y).is(BlockState.LAVA)) {
                return BlockState.LAVA;
            }
            else {
                const gridX = this.gridX(x - 5);
                const gridY = this.gridY(y + 1);
                const gridZ = this.gridZ(z - 5);
                let mag1 = Number.MAX_SAFE_INTEGER;
                let mag2 = Number.MAX_SAFE_INTEGER;
                let mag3 = Number.MAX_SAFE_INTEGER;
                let loc1 = BlockPos.ZERO;
                let loc2 = BlockPos.ZERO;
                let loc3 = BlockPos.ZERO;
                for (let xOffset = 0; xOffset <= 1; xOffset += 1) {
                    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
                        for (let zOffset = 0; zOffset <= 1; zOffset += 1) {
                            const location = this.getLocation(gridX + xOffset, gridY + yOffset, gridZ + zOffset);
                            const magnitude = BlockPos.magnitude(location);
                            if (mag1 >= magnitude) {
                                loc3 = loc2;
                                loc2 = loc1;
                                loc1 = location;
                                mag3 = mag2;
                                mag2 = mag1;
                                mag1 = magnitude;
                            }
                            else if (mag2 >= magnitude) {
                                loc3 = loc2;
                                loc2 = location;
                                mag3 = mag2;
                                mag2 = magnitude;
                            }
                            else if (mag3 >= magnitude) {
                                loc3 = location;
                                mag3 = magnitude;
                            }
                        }
                    }
                }
                const status1 = this.getStatus(loc1);
                const status2 = this.getStatus(loc2);
                const status3 = this.getStatus(loc3);
                const similarity12 = NoiseAquifer.similarity(mag1, mag2);
                const similarity13 = NoiseAquifer.similarity(mag1, mag3);
                const similarity23 = NoiseAquifer.similarity(mag2, mag3);
                let pressure;
                if (status1.at(y).is(BlockState.WATER) && this.globalFluidPicker(x, y - 1, z).at(y - 1).is(BlockState.LAVA)) {
                    pressure = 1;
                }
                else if (similarity12 > -1) {
                    const barrier = lazy(() => this.router.barrier.compute(DensityFunction.context(x, y * 0.5, z)));
                    const pressure12 = this.calculatePressure(y, status1, status2, barrier);
                    const pressure13 = this.calculatePressure(y, status1, status3, barrier);
                    const pressure23 = this.calculatePressure(y, status2, status3, barrier);
                    const n = Math.max(pressure12, pressure13 * Math.max(0, similarity13), pressure23 * Math.max(similarity23));
                    pressure = Math.max(0, 2 * Math.max(0, similarity12) * n);
                }
                else {
                    pressure = 0;
                }
                if (density + pressure <= 0) {
                    return status1.at(y);
                }
            }
        }
        return undefined;
    }
    static similarity(a, b) {
        return 1 - Math.abs(b - a) / 25;
    }
    calculatePressure(y, status1, status2, barrier) {
        const fluid1 = status1.at(y);
        const fluid2 = status2.at(y);
        if ((fluid1.is(BlockState.LAVA) && fluid2.is(BlockState.WATER)) || (fluid1.is(BlockState.WATER) && fluid2.is(BlockState.LAVA))) {
            return 1;
        }
        const levelDiff = Math.abs(status1.level - status2.level);
        if (levelDiff === 0) {
            return 0;
        }
        const levelAvg = (status1.level + status2.level) / 2;
        const levelAvgDiff = y + 0.5 - levelAvg;
        const p = levelDiff / 2 - Math.abs(levelAvgDiff);
        const pressure = levelAvgDiff > 0
            ? p > 0 ? p / 1.5 : p / 2.5
            : p > -3 ? (p + 3) / 3 : (p + 3) / 10;
        if (pressure < -2 || pressure > 2) {
            return pressure;
        }
        return pressure + barrier();
    }
    getStatus(location) {
        const [x, y, z] = location;
        const index = this.getIndex(this.gridX(x), this.gridY(y), this.gridZ(z));
        const cachedStatus = this.aquiferCache[index];
        if (cachedStatus !== undefined) {
            return cachedStatus;
        }
        const status = this.computeStatus(x, y, z);
        this.aquiferCache[index] = status;
        return status;
    }
    computeStatus(x, y, z) {
        const globalStatus = this.globalFluidPicker(x, y, z);
        let minPreliminarySurface = Number.MAX_SAFE_INTEGER;
        let isAquifer = false;
        for (const [xOffset, zOffset] of NoiseAquifer.SURFACE_SAMPLING) {
            const blockX = x + (zOffset << 4);
            const blockZ = z + (zOffset << 4);
            const preliminarySurface = this.noiseChunk.getPreliminarySurfaceLevel(blockX, blockZ);
            minPreliminarySurface = Math.min(minPreliminarySurface, preliminarySurface);
            const noOffset = xOffset === 0 && zOffset === 0;
            if (noOffset && y - 12 > preliminarySurface + 8) {
                return globalStatus;
            }
            if ((noOffset || y + 12 > preliminarySurface + 8)) {
                const newStatus = this.globalFluidPicker(blockX, preliminarySurface + 8, blockZ);
                if (!newStatus.at(preliminarySurface + 8).is(BlockState.AIR)) {
                    if (noOffset) {
                        return newStatus;
                    }
                    else {
                        isAquifer = true;
                    }
                }
            }
        }
        const allowedFloodedness = isAquifer ? clampedMap(minPreliminarySurface + 8 - y, 0, 64, 1, 0) : 0;
        const floodedness = clamp(this.router.fluidLevelFloodedness.compute(DensityFunction.context(x, y * 0.67, z)), -1, 1);
        if (floodedness > map(allowedFloodedness, 1, 0, -0.3, 0.8)) {
            return globalStatus;
        }
        if (floodedness <= map(allowedFloodedness, 1, 0, -0.8, 0.4)) {
            return new FluidStatus(Number.MIN_SAFE_INTEGER, globalStatus.type);
        }
        const gridY = Math.floor(y / 40);
        const spread = this.router.fluidLevelSpread.compute(DensityFunction.context(Math.floor(x / 16), gridY, Math.floor(z / 16)));
        const level = gridY * 40 + 20 + Math.floor(spread / 3) * 3;
        const statusLevel = Math.min(minPreliminarySurface, level);
        const fluid = this.getFluidType(x, y, z, globalStatus.type, level);
        return new FluidStatus(statusLevel, fluid);
    }
    getFluidType(x, y, z, global, level) {
        if (level <= -10) {
            const lava = this.router.lava.compute(DensityFunction.context(Math.floor(x / 64), Math.floor(y / 40), Math.floor(z / 64)));
            if (Math.abs(lava) > 0.3) {
                return BlockState.LAVA;
            }
        }
        return global;
    }
    getLocation(x, y, z) {
        const index = this.getIndex(x, y, z);
        const cachedLocation = this.aquiferLocationCache[index];
        if (BlockPos.equals(cachedLocation, BlockPos.ZERO)) {
            return cachedLocation;
        }
        const random = this.random.at(x, y, z);
        const location = BlockPos.create(x * NoiseAquifer.X_SPACING + random.nextInt(10), y * NoiseAquifer.Y_SPACING + random.nextInt(9), z * NoiseAquifer.Z_SPACING + random.nextInt(10));
        this.aquiferLocationCache[index] = location;
        return location;
    }
    getIndex(x, y, z) {
        const gridX = x - this.minGridX;
        const gridY = y - this.minGridY;
        const gridZ = z - this.minGridZ;
        const index = (gridY * this.gridSizeZ + gridZ) * this.gridSizeX + gridX;
        if (index < 0 || index >= this.gridSize) {
            throw new Error(`Invalid aquifer index at ${x} ${y} ${z}: 0 <= ${index} < ${this.gridSize}`);
        }
        return index;
    }
    gridX(x) {
        return Math.floor(x / NoiseAquifer.X_SPACING);
    }
    gridY(y) {
        return Math.floor(y / NoiseAquifer.Y_SPACING);
    }
    gridZ(z) {
        return Math.floor(z / NoiseAquifer.Z_SPACING);
    }
}
//# sourceMappingURL=Aquifer.js.map