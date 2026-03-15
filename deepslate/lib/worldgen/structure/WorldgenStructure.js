import { BlockPos, Holder, HolderSet, Identifier, Registry, Rotation } from '../../core/index.js';
import { LegacyRandom } from '../../math/index.js';
import { Json } from '../../util/Json.js';
import { Heightmap } from '../Heightmap.js';
import { HeightProvider } from '../HeightProvider.js';
import { NoiseChunkGenerator } from '../NoiseChunkGenerator.js';
import { RandomState } from '../RandomState.js';
import { WorldgenRegistries } from '../WorldgenRegistries.js';
import { StructurePoolElement } from './StructurePoolElement.js';
import { StructureTemplatePool } from './StructureTemplatePool.js';
export class WorldgenStructure {
    settings;
    constructor(settings) {
        this.settings = settings;
    }
    onTopOfChunkCenter(context, chunkX, chunkZ, heightmap = 'WORLD_SURFACE_WG') {
        const posX = (chunkX << 4) + 8;
        const posZ = (chunkZ << 4) + 8;
        return [posX, context.chunkGenerator.getBaseHeight(posX, posZ, heightmap, context.randomState) - 1, posZ]; // TODO
    }
    getLowestY(context, minX, minZ, width, depth) {
        return Math.min(context.chunkGenerator.getBaseHeight(minX, minZ, 'WORLD_SURFACE_WG', context.randomState) - 1, context.chunkGenerator.getBaseHeight(minX, minZ + depth, 'WORLD_SURFACE_WG', context.randomState) - 1, context.chunkGenerator.getBaseHeight(minX + width, minZ, 'WORLD_SURFACE_WG', context.randomState) - 1, context.chunkGenerator.getBaseHeight(minX + width, minZ + depth, 'WORLD_SURFACE_WG', context.randomState) - 1);
    }
    getLowestYIn5by5BoxOffset7Blocks(context, chunkX, chunkZ, rotation) {
        let width = 5;
        let depth = 5;
        if (rotation === Rotation.CLOCKWISE_90) {
            width = -5;
        }
        else if (rotation === Rotation.CLOCKWISE_180) {
            width = -5;
            depth = -5;
        }
        else if (rotation === Rotation.COUNTERCLOCKWISE_90) {
            depth = -5;
        }
        const posX = (chunkX << 4) + 7;
        const posZ = (chunkZ << 4) + 7;
        return BlockPos.create(posX, this.getLowestY(context, posX, posZ, width, depth), posZ);
    }
    tryGenerate(chunkX, chunkZ, context) {
        const random = LegacyRandom.fromLargeFeatureSeed(context.seed, chunkX, chunkZ);
        const pos = this.findGenerationPoint(chunkX, chunkZ, random, context);
        if (pos === undefined)
            return undefined;
        const biome = context.biomeSource.getBiome(pos[0] >> 2, pos[1] >> 2, pos[2] >> 2, context.randomState.sampler);
        return [...this.settings.validBiomes.getEntries()].findIndex((b) => b.key()?.equals(biome)) >= 0 ? pos : undefined;
    }
}
(function (WorldgenStructure) {
    WorldgenStructure.REGISTRY = Registry.createAndRegister('worldgen/structure', fromJson);
    class StructureSettings {
        validBiomes;
        constructor(validBiomes) {
            this.validBiomes = validBiomes;
        }
    }
    WorldgenStructure.StructureSettings = StructureSettings;
    class GenerationContext {
        seed;
        biomeSource;
        settings;
        levelHeight;
        chunkGenerator;
        randomState;
        constructor(seed, biomeSource, settings, levelHeight) {
            this.seed = seed;
            this.biomeSource = biomeSource;
            this.settings = settings;
            this.levelHeight = levelHeight;
            this.randomState = new RandomState(settings, seed);
            this.chunkGenerator = new NoiseChunkGenerator(biomeSource, settings);
        }
    }
    WorldgenStructure.GenerationContext = GenerationContext;
    const structurePoolParser = Holder.parser(StructureTemplatePool.REGISTRY, StructureTemplatePool.fromJson);
    function fromJson(obj) {
        const BiomeTagParser = HolderSet.parser(WorldgenRegistries.BIOME);
        const root = Json.readObject(obj) ?? {};
        const biomes = BiomeTagParser(root.biomes);
        const settings = new StructureSettings(biomes.value());
        switch (Json.readString(root.type)?.replace(/^minecraft:/, '')) {
            case 'buried_treasure':
                return new BuriedTreasureStructure(settings);
            case 'desert_pyramid':
                return new DesertPyramidStructure(settings);
            case 'end_city':
                return new EndCityStructure(settings);
            case 'fortress':
                return new NetherFortressStructure(settings);
            case 'igloo':
                return new IglooStructure(settings);
            case 'jigsaw':
                const startHeight = HeightProvider.fromJson(root.start_height);
                const startPool = structurePoolParser(root.start_pool);
                const startJigsawNameString = Json.readString(root.start_jigsaw_name);
                const startJigsawName = startJigsawNameString ? Identifier.parse(startJigsawNameString) : undefined;
                const heightmap = Heightmap.fromJson(root.project_start_to_heightmap);
                const dimensionPadding = JigsawStructure.DimensionPadding.fromJson(root.dimension_padding);
                return new JigsawStructure(settings, startPool, startHeight, heightmap, startJigsawName, dimensionPadding);
            case 'jungle_temple':
                return new JungleTempleStructure(settings);
            case 'mineshaft':
                const type = Json.readString(root.mineshaft_type) === 'mesa' ? 'mesa' : 'normal';
                return new MineshaftStructure(settings, type);
            case 'nether_fossil':
                return new NetherFortressStructure(settings);
            case 'ocean_monument':
                return new OceanMonumentStructure(settings);
            case 'ocean_ruin':
                return new OceanRuinStructure(settings);
            case 'ruined_portal':
                return new RuinedPortalStructure(settings);
            case 'shipwreck':
                const isBeached = Json.readBoolean(root.is_beached) ?? false;
                return new ShipwreckStructure(settings, isBeached);
            case 'stronghold':
                return new StrongholdStructure(settings);
            case 'swamp_hut':
                return new SwampHutStructure(settings);
            case 'woodland_mansion':
                return new WoodlandMansionStructure(settings);
        }
        return new BuriedTreasureStructure(settings);
    }
    WorldgenStructure.fromJson = fromJson;
    class JigsawStructure extends WorldgenStructure {
        startingPoolHolder;
        startHeight;
        projectStartToHeightmap;
        startJigsawName;
        dimensionPadding;
        constructor(settings, startingPoolHolder, startHeight, projectStartToHeightmap, startJigsawName, dimensionPadding) {
            super(settings);
            this.startingPoolHolder = startingPoolHolder;
            this.startHeight = startHeight;
            this.projectStartToHeightmap = projectStartToHeightmap;
            this.startJigsawName = startJigsawName;
            this.dimensionPadding = dimensionPadding;
        }
        findGenerationPoint(chunkX, chunkZ, random, context) {
            var y = this.startHeight(random, context.settings.noise);
            const pos = BlockPos.create(chunkX << 4, y, chunkZ << 4);
            const rotation = Rotation.getRandom(random);
            const startingPool = this.startingPoolHolder.value();
            const startingElement = startingPool.getRandomTemplate(random);
            if (startingElement instanceof StructurePoolElement.EmptyPoolElement) {
                return undefined;
            }
            else {
                var startJigsawOffset;
                if (this.startJigsawName) {
                    const offset = JigsawStructure.getRandomNamedJigsaw(startingElement, this.startJigsawName, rotation, random);
                    if (offset === undefined) {
                        return undefined;
                    }
                    startJigsawOffset = offset;
                }
                else {
                    startJigsawOffset = BlockPos.ZERO;
                }
                const templateStartPos = BlockPos.subtract(pos, startJigsawOffset);
                const boundingBox = startingElement.getBoundingBox(templateStartPos, rotation);
                const x = ((boundingBox[1][0] + boundingBox[0][0]) / 2) ^ 0;
                const z = ((boundingBox[1][2] + boundingBox[0][2]) / 2) ^ 0;
                var y;
                if (this.projectStartToHeightmap) {
                    y = pos[1] + context.chunkGenerator.getBaseHeight(x, z, this.projectStartToHeightmap, context.randomState);
                }
                else {
                    y = templateStartPos[1];
                }
                boundingBox.forEach(pos => pos[1] += y - boundingBox[0][1] - 1);
                if (JigsawStructure.isStartTooCloseToWorldHeightLimits(this.dimensionPadding, boundingBox, context.levelHeight)) {
                    return undefined;
                }
                const generationPoint = BlockPos.create(x, y + startJigsawOffset[1], z);
                //console.log(`Generating Jigsaw Structure in Chunk ${chunkX}, ${chunkZ}: rotation: ${rotation}, startingElement: ${startingElement.toString()}, center: ${x}, ${y}, ${z}`)
                return generationPoint;
            }
        }
        static isStartTooCloseToWorldHeightLimits(dimensionPadding, boundingBox, levelHeight) {
            if (dimensionPadding === JigsawStructure.DimensionPadding.ZERO) { // reference comparison here is correct (i.e. matching vanilla), see MC-278259
                return false;
            }
            const bottomLimit = levelHeight.minY + dimensionPadding.bottom;
            const topLimit = levelHeight.minY + levelHeight.height - dimensionPadding.top;
            return boundingBox[0][1] < bottomLimit || boundingBox[1][1] > topLimit;
        }
        static getRandomNamedJigsaw(element, name, rotation, random) {
            const jigsaws = element.getShuffledJigsawBlocks(rotation, random);
            for (const jigsaw of jigsaws) {
                if (Identifier.parse(jigsaw.nbt?.getString('name') ?? 'minecraft:empty').equals(name)) {
                    return jigsaw.pos;
                }
            }
            return undefined;
        }
    }
    WorldgenStructure.JigsawStructure = JigsawStructure;
    (function (JigsawStructure) {
        class DimensionPadding {
            top;
            bottom;
            static ZERO = new DimensionPadding(0, 0);
            constructor(top, bottom) {
                this.top = top;
                this.bottom = bottom;
            }
            static fromJson(obj) {
                if (obj === undefined) {
                    return DimensionPadding.ZERO;
                }
                if (typeof obj === 'number') {
                    return new DimensionPadding(obj, obj);
                }
                const padding = Json.readObject(obj) ?? {};
                return new DimensionPadding(Json.readInt(padding.top) ?? 0, Json.readInt(padding.bottom) ?? 0);
            }
        }
        JigsawStructure.DimensionPadding = DimensionPadding;
    })(JigsawStructure = WorldgenStructure.JigsawStructure || (WorldgenStructure.JigsawStructure = {}));
    class BuriedTreasureStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ, _, context) {
            return this.onTopOfChunkCenter(context, chunkX, chunkZ, 'OCEAN_FLOOR_WG');
        }
    }
    WorldgenStructure.BuriedTreasureStructure = BuriedTreasureStructure;
    class SinglePieceStructure extends WorldgenStructure {
        width;
        depth;
        constructor(settings, width, depth) {
            super(settings);
            this.width = width;
            this.depth = depth;
        }
        findGenerationPoint(chunkX, chunkZ, _, context) {
            if (this.getLowestY(context, chunkX << 4, chunkZ << 4, this.width, this.depth) < context.settings.seaLevel) {
                return undefined;
            }
            else {
                return this.onTopOfChunkCenter(context, chunkX, chunkZ);
            }
        }
    }
    class DesertPyramidStructure extends SinglePieceStructure {
        constructor(settings) {
            super(settings, 21, 21);
        }
    }
    WorldgenStructure.DesertPyramidStructure = DesertPyramidStructure;
    class EndCityStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ, random, context) {
            const rotation = Rotation.getRandom(random);
            const pos = this.getLowestYIn5by5BoxOffset7Blocks(context, chunkX, chunkZ, rotation);
            if (pos[1] < 60)
                return undefined;
            return pos;
        }
    }
    WorldgenStructure.EndCityStructure = EndCityStructure;
    class NetherFortressStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ) {
            return BlockPos.create(chunkX << 4, 64, chunkZ << 4);
        }
    }
    WorldgenStructure.NetherFortressStructure = NetherFortressStructure;
    class IglooStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ, _, context) {
            return this.onTopOfChunkCenter(context, chunkX, chunkZ);
        }
    }
    WorldgenStructure.IglooStructure = IglooStructure;
    class JungleTempleStructure extends SinglePieceStructure {
        constructor(settings) {
            super(settings, 12, 15);
        }
    }
    WorldgenStructure.JungleTempleStructure = JungleTempleStructure;
    class MineshaftStructure extends WorldgenStructure {
        type;
        constructor(settings, type) {
            super(settings);
            this.type = type;
        }
        findGenerationPoint(chunkX, chunkZ, random, context) {
            throw new Error('Method not implemented.');
        }
    }
    WorldgenStructure.MineshaftStructure = MineshaftStructure;
    class NetherFossilStructure extends WorldgenStructure {
        height;
        constructor(settings, height) {
            super(settings);
            this.height = height;
        }
        findGenerationPoint(chunkX, chunkZ) {
            throw new Error('Method not implemented.');
        }
    }
    WorldgenStructure.NetherFossilStructure = NetherFossilStructure;
    class OceanMonumentStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ) {
            throw new Error('Method not implemented.');
        }
    }
    WorldgenStructure.OceanMonumentStructure = OceanMonumentStructure;
    class OceanRuinStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ, _, context) {
            return this.onTopOfChunkCenter(context, chunkX, chunkZ, 'OCEAN_FLOOR_WG');
        }
    }
    WorldgenStructure.OceanRuinStructure = OceanRuinStructure;
    class RuinedPortalStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ) {
            throw new Error('Method not implemented.');
        }
    }
    WorldgenStructure.RuinedPortalStructure = RuinedPortalStructure;
    class ShipwreckStructure extends WorldgenStructure {
        isBeached;
        constructor(settings, isBeached) {
            super(settings);
            this.isBeached = isBeached;
        }
        findGenerationPoint(chunkX, chunkZ, _, context) {
            return this.onTopOfChunkCenter(context, chunkX, chunkZ, this.isBeached ? 'WORLD_SURFACE_WG' : 'OCEAN_FLOOR_WG');
        }
    }
    WorldgenStructure.ShipwreckStructure = ShipwreckStructure;
    class StrongholdStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ) {
            return BlockPos.create(chunkX << 4, 0, chunkZ << 4);
        }
    }
    WorldgenStructure.StrongholdStructure = StrongholdStructure;
    class SwampHutStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ, _, context) {
            return this.onTopOfChunkCenter(context, chunkX, chunkZ);
        }
    }
    WorldgenStructure.SwampHutStructure = SwampHutStructure;
    class WoodlandMansionStructure extends WorldgenStructure {
        findGenerationPoint(chunkX, chunkZ, random, context) {
            const rotation = Rotation.getRandom(random);
            const pos = this.getLowestYIn5by5BoxOffset7Blocks(context, chunkX, chunkZ, rotation);
            if (pos[1] < 60)
                return undefined;
            return pos;
        }
    }
    WorldgenStructure.WoodlandMansionStructure = WoodlandMansionStructure;
})(WorldgenStructure || (WorldgenStructure = {}));
//# sourceMappingURL=WorldgenStructure.js.map