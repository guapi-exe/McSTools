import type { ChunkPos } from '../../core/index.js';
import { BlockPos, Holder, HolderSet } from '../../core/index.js';
import type { Climate } from '../biome/index.js';
import { BiomeSource } from '../biome/index.js';
import { StructureSet } from './StructureSet.js';
export declare abstract class StructurePlacement {
    protected readonly locateOffset: BlockPos;
    protected readonly frequencyReductionMethod: StructurePlacement.FrequencyReducer;
    readonly frequency: number;
    protected readonly salt: number;
    protected readonly exclusionZone: StructurePlacement.ExclusionZone | undefined;
    protected constructor(locateOffset: BlockPos, frequencyReductionMethod: StructurePlacement.FrequencyReducer, frequency: number, salt: number, exclusionZone: StructurePlacement.ExclusionZone | undefined);
    static fromJson(obj: unknown): StructurePlacement;
    protected abstract isPlacementChunk(seed: bigint, chunkX: number, chunkZ: number): boolean;
    isStructureChunk(seed: bigint, chunkX: number, chunkZ: number): boolean;
    abstract getPotentialStructureChunks(seed: bigint, minChunkX: number, minChunkZ: number, maxChunkX: number, maxChunkZ: number): ChunkPos[];
    prepare(_biomeSource: BiomeSource, _sampler: Climate.Sampler, _concentricRingsSeed: bigint): void;
}
export declare namespace StructurePlacement {
    type FrequencyReducer = (seed: bigint, salt: number, chunkX: number, chunkZ: number, frequency: number) => boolean;
    namespace FrequencyReducer {
        function fromType(type: string): FrequencyReducer;
        function ProbabilityReducer(seed: bigint, salt: number, chunkX: number, chunkZ: number, frequency: number): boolean;
        function LegacyProbabilityReducerWithDouble(seed: bigint, _: number, chunkX: number, chunkZ: number, frequency: number): boolean;
        function LegacyArbitrarySaltProbabilityReducer(seed: bigint, _: number, chunkX: number, chunkZ: number, frequency: number): boolean;
        function LegacyPillagerOutpostReducer(seed: bigint, _: number, chunkX: number, chunkZ: number, frequency: number): boolean;
    }
    class ExclusionZone {
        private readonly otherSet;
        private readonly chunkCount;
        constructor(otherSet: Holder<StructureSet>, chunkCount: number);
        static fromJson(obj: unknown): ExclusionZone;
        isPlacementForbidden(seed: bigint, chunkX: number, chunkZ: number): boolean;
    }
    type SpreadType = 'linear' | 'triangular';
    namespace SpreadType {
        function fromJson(obj: unknown): SpreadType;
    }
    class RandomSpreadStructurePlacement extends StructurePlacement {
        readonly spacing: number;
        readonly separation: number;
        readonly spreadType: SpreadType;
        constructor(locateOffset: BlockPos, frequencyReductionMethod: StructurePlacement.FrequencyReducer, frequency: number, salt: number, exclusionZone: StructurePlacement.ExclusionZone | undefined, spacing: number, separation: number, spreadType: SpreadType);
        private evaluateSpread;
        getPotentialStructureChunk(seed: bigint, chunkX: number, chunkZ: number): ChunkPos;
        protected isPlacementChunk(seed: bigint, chunkX: number, chunkZ: number): boolean;
        getPotentialStructureChunks(seed: bigint, minChunkX: number, minChunkZ: number, maxChunkX: number, maxChunkZ: number): ChunkPos[];
    }
    class ConcentricRingsStructurePlacement extends StructurePlacement {
        private readonly distance;
        private readonly spread;
        private readonly count;
        private readonly preferredBiomes;
        private positions?;
        constructor(locateOffset: BlockPos, frequencyReductionMethod: StructurePlacement.FrequencyReducer, frequency: number, salt: number, exclusionZone: StructurePlacement.ExclusionZone | undefined, distance: number, spread: number, count: number, preferredBiomes: Holder<HolderSet<unknown>>);
        prepare(biomeSource: BiomeSource, sampler: Climate.Sampler, concentricRingsSeed: bigint): void;
        protected isPlacementChunk(seed: bigint, chunkX: number, chunkZ: number): boolean;
        getPotentialStructureChunks(seed: bigint, minChunkX: number, minChunkZ: number, maxChunkX: number, maxChunkZ: number): ChunkPos[];
    }
}
//# sourceMappingURL=StructurePlacement.d.ts.map