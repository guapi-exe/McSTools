import { BlockPos, Holder, HolderSet, Identifier, Registry, Rotation } from '../../core/index.js';
import type { Random } from '../../math/index.js';
import type { BiomeSource } from '../biome/index.js';
import { Heightmap } from '../Heightmap.js';
import { HeightProvider } from '../HeightProvider.js';
import type { LevelHeight } from '../LevelHeight.js';
import { NoiseChunkGenerator } from '../NoiseChunkGenerator.js';
import type { NoiseGeneratorSettings } from '../NoiseGeneratorSettings.js';
import { RandomState } from '../RandomState.js';
import { StructureTemplatePool } from './StructureTemplatePool.js';
export declare type SufaceLevelAccessor = (posX: number, posZ: number, heightmap: Heightmap) => number;
export declare abstract class WorldgenStructure {
    protected settings: WorldgenStructure.StructureSettings;
    constructor(settings: WorldgenStructure.StructureSettings);
    abstract findGenerationPoint(chunkX: number, chunkZ: number, random: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    protected onTopOfChunkCenter(context: WorldgenStructure.GenerationContext, chunkX: number, chunkZ: number, heightmap?: Heightmap): BlockPos;
    protected getLowestY(context: WorldgenStructure.GenerationContext, minX: number, minZ: number, width: number, depth: number): number;
    protected getLowestYIn5by5BoxOffset7Blocks(context: WorldgenStructure.GenerationContext, chunkX: number, chunkZ: number, rotation: Rotation): BlockPos;
    tryGenerate(chunkX: number, chunkZ: number, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
}
export declare namespace WorldgenStructure {
    export const REGISTRY: Registry<WorldgenStructure>;
    export class StructureSettings {
        readonly validBiomes: HolderSet<unknown>;
        constructor(validBiomes: HolderSet<unknown>);
    }
    export class GenerationContext {
        readonly seed: bigint;
        readonly biomeSource: BiomeSource;
        readonly settings: NoiseGeneratorSettings;
        readonly levelHeight: LevelHeight;
        readonly chunkGenerator: NoiseChunkGenerator;
        readonly randomState: RandomState;
        constructor(seed: bigint, biomeSource: BiomeSource, settings: NoiseGeneratorSettings, levelHeight: LevelHeight);
    }
    export function fromJson(obj: unknown): WorldgenStructure;
    export class JigsawStructure extends WorldgenStructure {
        private readonly startingPoolHolder;
        private readonly startHeight;
        private readonly projectStartToHeightmap;
        private readonly startJigsawName;
        private readonly dimensionPadding;
        constructor(settings: WorldgenStructure.StructureSettings, startingPoolHolder: Holder<StructureTemplatePool>, startHeight: HeightProvider, projectStartToHeightmap: Heightmap | undefined, startJigsawName: Identifier | undefined, dimensionPadding: JigsawStructure.DimensionPadding);
        findGenerationPoint(chunkX: number, chunkZ: number, random: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
        static isStartTooCloseToWorldHeightLimits(dimensionPadding: JigsawStructure.DimensionPadding, boundingBox: [BlockPos, BlockPos], levelHeight: LevelHeight): boolean;
        private static getRandomNamedJigsaw;
    }
    export namespace JigsawStructure {
        class DimensionPadding {
            top: number;
            bottom: number;
            static ZERO: DimensionPadding;
            constructor(top: number, bottom: number);
            static fromJson(obj: unknown): DimensionPadding;
        }
    }
    export class BuriedTreasureStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number, _: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    class SinglePieceStructure extends WorldgenStructure {
        private readonly width;
        private readonly depth;
        constructor(settings: WorldgenStructure.StructureSettings, width: number, depth: number);
        findGenerationPoint(chunkX: number, chunkZ: number, _: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    export class DesertPyramidStructure extends SinglePieceStructure {
        constructor(settings: WorldgenStructure.StructureSettings);
    }
    export class EndCityStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number, random: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    export class NetherFortressStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number): BlockPos | undefined;
    }
    export class IglooStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number, _: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    export class JungleTempleStructure extends SinglePieceStructure {
        constructor(settings: WorldgenStructure.StructureSettings);
    }
    export class MineshaftStructure extends WorldgenStructure {
        private readonly type;
        constructor(settings: WorldgenStructure.StructureSettings, type: 'normal' | 'mesa');
        findGenerationPoint(chunkX: number, chunkZ: number, random: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    export class NetherFossilStructure extends WorldgenStructure {
        private readonly height;
        constructor(settings: WorldgenStructure.StructureSettings, height: HeightProvider);
        findGenerationPoint(chunkX: number, chunkZ: number): BlockPos | undefined;
    }
    export class OceanMonumentStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number): BlockPos | undefined;
    }
    export class OceanRuinStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number, _: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    export class RuinedPortalStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number): BlockPos | undefined;
    }
    export class ShipwreckStructure extends WorldgenStructure {
        private readonly isBeached;
        constructor(settings: WorldgenStructure.StructureSettings, isBeached: boolean);
        findGenerationPoint(chunkX: number, chunkZ: number, _: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    export class StrongholdStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number): BlockPos | undefined;
    }
    export class SwampHutStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number, _: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    export class WoodlandMansionStructure extends WorldgenStructure {
        findGenerationPoint(chunkX: number, chunkZ: number, random: Random, context: WorldgenStructure.GenerationContext): BlockPos | undefined;
    }
    export {};
}
//# sourceMappingURL=WorldgenStructure.d.ts.map