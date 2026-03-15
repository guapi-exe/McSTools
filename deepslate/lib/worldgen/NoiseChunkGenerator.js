import { BlockState, ChunkPos } from '../core/index.js';
import { computeIfAbsent } from '../util/index.js';
import { FluidStatus } from './Aquifer.js';
import { NoiseChunk } from './NoiseChunk.js';
import { NoiseSettings } from './NoiseSettings.js';
export class NoiseChunkGenerator {
    biomeSource;
    settings;
    noiseChunkCache;
    globalFluidPicker;
    constructor(biomeSource, settings) {
        this.biomeSource = biomeSource;
        this.settings = settings;
        this.noiseChunkCache = new Map();
        const lavaFluid = new FluidStatus(-54, BlockState.LAVA);
        const defaultFluid = new FluidStatus(settings.seaLevel, settings.defaultFluid);
        this.globalFluidPicker = (x, y, z) => {
            if (y < Math.min(-54, settings.seaLevel)) {
                return lavaFluid;
            }
            return defaultFluid;
        };
    }
    getBaseHeight(blockX, blockZ, heightmap, randomState) {
        let predicate;
        if (heightmap === 'OCEAN_FLOOR' || heightmap === 'OCEAN_FLOOR_WG') {
            predicate = (state) => state.equals(BlockState.STONE);
        }
        else {
            predicate = (state) => !state.equals(BlockState.AIR);
        }
        return this.iterateNoiseColumn(randomState, blockX, blockZ, undefined, predicate, BlockState.STONE) ?? this.settings.noise.minY;
    }
    iterateNoiseColumn(randomState, blockX, blockZ, fillArray, predicate, defaultBlock) {
        const minY = this.settings.noise.minY;
        const cellHeight = NoiseSettings.cellHeight(this.settings.noise);
        const minCellY = Math.floor(minY / cellHeight);
        const cellCountY = Math.floor(this.settings.noise.height / cellHeight);
        if (cellCountY <= 0) {
            return undefined;
        }
        const cellWidth = NoiseSettings.cellWidth(this.settings.noise);
        const cellX = Math.floor(blockX / cellWidth);
        const cellZ = Math.floor(blockZ / cellWidth);
        const noiseChunk = new NoiseChunk(1, cellCountY, minCellY, randomState, cellX, cellZ, this.settings.noise, this.settings.aquifersEnabled, this.globalFluidPicker);
        for (let cellY = cellCountY - 1; cellY >= 0; cellY -= 1) {
            for (let offY = cellHeight - 1; offY >= 0; offY -= 1) {
                const blockY = (minCellY + cellY) * cellHeight + offY;
                const state = noiseChunk.getFinalState(blockX, blockY, blockZ) ?? defaultBlock ?? this.settings.defaultBlock;
                if (fillArray !== undefined) {
                    fillArray[blockY + minY] = state;
                }
                if (predicate !== undefined && predicate(state)) {
                    return blockY + 1;
                }
            }
        }
    }
    fill(randomState, chunk, onlyFirstZ = false) {
        const minY = Math.max(chunk.minY, this.settings.noise.minY);
        const maxY = Math.min(chunk.maxY, this.settings.noise.minY + this.settings.noise.height);
        const cellWidth = NoiseSettings.cellWidth(this.settings.noise);
        const cellHeight = NoiseSettings.cellHeight(this.settings.noise);
        const cellCountXZ = Math.floor(16 / cellWidth);
        const minCellY = Math.floor(minY / cellHeight);
        const cellCountY = Math.floor((maxY - minY) / cellHeight);
        const minX = ChunkPos.minBlockX(chunk.pos);
        const minZ = ChunkPos.minBlockZ(chunk.pos);
        const noiseChunk = this.getOrCreateNoiseChunk(randomState, chunk);
        for (let cellX = 0; cellX < cellCountXZ; cellX += 1) {
            for (let cellZ = 0; cellZ < (onlyFirstZ ? 1 : cellCountXZ); cellZ += 1) {
                let section = chunk.getOrCreateSection(chunk.sectionsCount - 1);
                for (let cellY = cellCountY - 1; cellY >= 0; cellY -= 1) {
                    for (let offY = cellHeight - 1; offY >= 0; offY -= 1) {
                        const blockY = (minCellY + cellY) * cellHeight + offY;
                        const sectionY = blockY & 0xF;
                        const sectionIndex = chunk.getSectionIndex(blockY);
                        if (chunk.getSectionIndex(section.minBlockY) !== sectionIndex) {
                            section = chunk.getOrCreateSection(sectionIndex);
                        }
                        for (let offX = 0; offX < cellWidth; offX += 1) {
                            const blockX = minX + cellX * cellWidth + offX;
                            const sectionX = blockX & 0xF;
                            for (let offZ = 0; offZ < (onlyFirstZ ? 1 : cellWidth); offZ += 1) {
                                const blockZ = minZ + cellZ * cellWidth + offZ;
                                const sectionZ = blockZ & 0xF;
                                const state = noiseChunk.getFinalState(blockX, blockY, blockZ) ?? this.settings.defaultBlock;
                                section.setBlockState(sectionX, sectionY, sectionZ, state);
                            }
                        }
                    }
                }
            }
        }
    }
    buildSurface(randomState, chunk, /** @deprecated */ biome = 'minecraft:plains') {
        const noiseChunk = this.getOrCreateNoiseChunk(randomState, chunk);
        const context = this.settings.noise;
        randomState.surfaceSystem.buildSurface(chunk, noiseChunk, context, () => biome);
    }
    computeBiome(randomState, quartX, quartY, quartZ) {
        return this.biomeSource.getBiome(quartX, quartY, quartZ, randomState.sampler);
    }
    getOrCreateNoiseChunk(randomState, chunk) {
        return computeIfAbsent(this.noiseChunkCache, ChunkPos.toLong(chunk.pos), () => {
            const minY = Math.max(chunk.minY, this.settings.noise.minY);
            const maxY = Math.min(chunk.maxY, this.settings.noise.minY + this.settings.noise.height);
            const cellWidth = NoiseSettings.cellWidth(this.settings.noise);
            const cellHeight = NoiseSettings.cellHeight(this.settings.noise);
            const cellCountXZ = Math.floor(16 / cellWidth);
            const minCellY = Math.floor(minY / cellHeight);
            const cellCountY = Math.floor((maxY - minY) / cellHeight);
            const minX = ChunkPos.minBlockX(chunk.pos);
            const minZ = ChunkPos.minBlockZ(chunk.pos);
            return new NoiseChunk(cellCountXZ, cellCountY, minCellY, randomState, minX, minZ, this.settings.noise, this.settings.aquifersEnabled, this.globalFluidPicker);
        });
    }
}
//# sourceMappingURL=NoiseChunkGenerator.js.map