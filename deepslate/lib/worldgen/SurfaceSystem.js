import { BlockPos, BlockState, ChunkPos } from '../core/index.js';
import { lerp2, map, XoroshiroRandom } from '../math/index.js';
import { computeIfAbsent, Json, lazy } from '../util/index.js';
import { NoiseRouter } from './NoiseRouter.js';
import { VerticalAnchor } from './VerticalAnchor.js';
import { WorldgenRegistries } from './WorldgenRegistries.js';
export class SurfaceSystem {
    rule;
    defaultBlock;
    surfaceNoise;
    surfaceSecondaryNoise;
    random;
    positionalRandoms;
    constructor(rule, defaultBlock, seed) {
        this.rule = rule;
        this.defaultBlock = defaultBlock;
        this.random = XoroshiroRandom.create(seed).forkPositional();
        this.surfaceNoise = NoiseRouter.instantiate(this.random, WorldgenRegistries.SURFACE_NOISE);
        this.surfaceSecondaryNoise = NoiseRouter.instantiate(this.random, WorldgenRegistries.SURFACE_SECONDARY_NOISE);
        this.positionalRandoms = new Map();
    }
    buildSurface(chunk, noiseChunk, worldgenContext, getBiome) {
        const minX = ChunkPos.minBlockX(chunk.pos);
        const minZ = ChunkPos.minBlockZ(chunk.pos);
        const surfaceContext = new SurfaceContext(this, chunk, noiseChunk, worldgenContext, getBiome);
        const ruleWithContext = this.rule(surfaceContext);
        for (let x = 0; x < 16; x += 1) {
            const worldX = minX + x;
            for (let z = 0; z < 1; z += 1) {
                const worldZ = minZ + z;
                surfaceContext.updateXZ(worldX, worldZ);
                let stoneDepthAbove = 0;
                let waterHeight = Number.MIN_SAFE_INTEGER;
                let stoneDepthOffset = Number.MAX_SAFE_INTEGER;
                for (let y = chunk.maxY; y >= chunk.minY; y -= 1) {
                    const worldPos = BlockPos.create(worldX, y, worldZ);
                    const oldState = chunk.getBlockState(worldPos);
                    if (oldState.equals(BlockState.AIR)) {
                        stoneDepthAbove = 0;
                        waterHeight = Number.MIN_SAFE_INTEGER;
                        continue;
                    }
                    if (oldState.isFluid()) {
                        if (waterHeight === Number.MIN_SAFE_INTEGER) {
                            waterHeight = y + 1;
                        }
                        continue;
                    }
                    if (stoneDepthOffset >= y) {
                        stoneDepthOffset = Number.MIN_SAFE_INTEGER;
                        for (let i = y - 1; i >= chunk.minY; i -= 1) {
                            const state = chunk.getBlockState(BlockPos.create(worldX, i, worldZ));
                            if (state.equals(BlockState.AIR) || state.isFluid()) {
                                stoneDepthOffset = i + 1;
                                break;
                            }
                        }
                    }
                    stoneDepthAbove += 1;
                    const stoneDepthBelow = y - stoneDepthOffset + 1;
                    if (!oldState.equals(this.defaultBlock)) {
                        continue;
                    }
                    surfaceContext.updateY(stoneDepthAbove, stoneDepthBelow, waterHeight, y);
                    const newState = ruleWithContext(worldX, y, worldZ);
                    if (newState) {
                        chunk.setBlockState(worldPos, newState);
                    }
                }
            }
        }
    }
    getSurfaceDepth(x, z) {
        const noise = this.surfaceNoise.sample(x, 0, z);
        const offset = this.random.at(x, 0, z).nextDouble() * 0.25;
        return noise * 2.75 + 3 + offset;
    }
    getSurfaceSecondary(x, z) {
        return this.surfaceSecondaryNoise.sample(x, 0, z);
    }
    getRandom(name) {
        return computeIfAbsent(this.positionalRandoms, name, () => {
            return this.random.fromHashOf(name);
        });
    }
}
export class SurfaceContext {
    system;
    chunk;
    noiseChunk;
    context;
    getBiome;
    blockX = 0;
    blockY = 0;
    blockZ = 0;
    stoneDepthAbove = 0;
    stoneDepthBelow = 0;
    surfaceDepth = 0;
    waterHeight = 0;
    biome = () => '';
    surfaceSecondary = () => 0;
    minSurfaceLevel = () => 0;
    constructor(system, chunk, noiseChunk, context, getBiome) {
        this.system = system;
        this.chunk = chunk;
        this.noiseChunk = noiseChunk;
        this.context = context;
        this.getBiome = getBiome;
    }
    updateXZ(x, z) {
        this.blockX = x;
        this.blockZ = z;
        this.surfaceDepth = this.system.getSurfaceDepth(x, z);
        this.surfaceSecondary = lazy(() => this.system.getSurfaceSecondary(x, z));
        this.minSurfaceLevel = lazy(() => this.calculateMinSurfaceLevel(x, z));
    }
    updateY(stoneDepthAbove, stoneDepthBelow, waterHeight, y) {
        this.blockY = y;
        this.stoneDepthAbove = stoneDepthAbove;
        this.stoneDepthBelow = stoneDepthBelow;
        this.waterHeight = waterHeight;
        this.biome = lazy(() => this.getBiome(BlockPos.create(this.blockX, this.blockY, this.blockZ)));
    }
    calculateMinSurfaceLevel(x, z) {
        const cellX = x >> 4;
        const cellZ = z >> 4;
        const level00 = this.noiseChunk.getPreliminarySurfaceLevel(cellX << 4, cellZ << 4);
        const level10 = this.noiseChunk.getPreliminarySurfaceLevel((cellX + 1) << 4, cellZ << 4);
        const level01 = this.noiseChunk.getPreliminarySurfaceLevel(cellX << 4, (cellZ + 1) << 4);
        const level11 = this.noiseChunk.getPreliminarySurfaceLevel((cellX + 1) << 4, (cellZ + 1) << 4);
        const level = Math.floor(lerp2((x & 0xF) / 16, (z & 0xF) / 16, level00, level10, level01, level11));
        return level + this.surfaceDepth - 8;
    }
}
export var SurfaceRule;
(function (SurfaceRule) {
    SurfaceRule.NOOP = () => () => undefined;
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const type = Json.readString(root.type)?.replace(/^minecraft:/, '');
        switch (type) {
            case 'block': return block(BlockState.fromJson(root.result_state));
            case 'sequence': return sequence(Json.readArray(root.sequence, SurfaceRule.fromJson) ?? []);
            case 'condition': return condition(SurfaceCondition.fromJson(root.if_true), SurfaceRule.fromJson(root.then_run));
        }
        return SurfaceRule.NOOP;
    }
    SurfaceRule.fromJson = fromJson;
    function block(state) {
        return () => () => state;
    }
    SurfaceRule.block = block;
    function sequence(rules) {
        return context => {
            const rulesWithContext = rules.map(rule => rule(context));
            return (x, y, z) => {
                for (const rule of rulesWithContext) {
                    const result = rule(x, y, z);
                    if (result)
                        return result;
                }
                return undefined;
            };
        };
    }
    SurfaceRule.sequence = sequence;
    function condition(ifTrue, thenRun) {
        return context => (x, y, z) => {
            if (ifTrue(context)) {
                return thenRun(context)(x, y, z);
            }
            return undefined;
        };
    }
    SurfaceRule.condition = condition;
})(SurfaceRule || (SurfaceRule = {}));
export var SurfaceCondition;
(function (SurfaceCondition) {
    SurfaceCondition.FALSE = () => false;
    SurfaceCondition.TRUE = () => true;
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const type = Json.readString(root.type)?.replace(/^minecraft:/, '');
        switch (type) {
            case 'above_preliminary_surface': return abovePreliminarySurface();
            case 'biome': return biome(Json.readArray(root.biome_is, e => Json.readString(e) ?? '') ?? []);
            case 'not': return not(SurfaceCondition.fromJson(root.invert));
            case 'stone_depth': return stoneDepth(Json.readInt(root.offset) ?? 0, Json.readBoolean(root.add_surface_depth) ?? false, Json.readInt(root.secondary_depth_range) ?? 0, Json.readString(root.surface_type) === 'ceiling');
            case 'vertical_gradient': return verticalGradient(Json.readString(root.random_name) ?? '', VerticalAnchor.fromJson(root.true_at_and_below), VerticalAnchor.fromJson(root.false_at_and_above));
            case 'water': return water(Json.readInt(root.offset) ?? 0, Json.readInt(root.surface_depth_multiplier) ?? 0, Json.readBoolean(root.add_surface_depth) ?? false);
            case 'y_above': return yAbove(VerticalAnchor.fromJson(root.anchor), Json.readInt(root.surface_depth_multiplier) ?? 0, Json.readBoolean(root.add_surface_depth) ?? false);
        }
        return SurfaceCondition.FALSE;
    }
    SurfaceCondition.fromJson = fromJson;
    function abovePreliminarySurface() {
        return context => context.blockY >= context.minSurfaceLevel();
    }
    SurfaceCondition.abovePreliminarySurface = abovePreliminarySurface;
    function biome(biomes) {
        const biomeSet = new Set(biomes);
        return context => biomeSet.has(context.biome());
    }
    SurfaceCondition.biome = biome;
    function not(invert) {
        return context => !invert(context);
    }
    SurfaceCondition.not = not;
    function stoneDepth(offset, addSurfaceDepth, secondaryDepthRange, ceiling) {
        return context => {
            const depth = ceiling ? context.stoneDepthBelow : context.stoneDepthAbove;
            const surfaceDepth = addSurfaceDepth ? context.surfaceDepth : 0;
            const secondaryDepth = secondaryDepthRange === 0 ? 0 : map(context.surfaceSecondary(), -1, 1, 0, secondaryDepthRange);
            return depth <= 1 + offset + surfaceDepth + secondaryDepth;
        };
    }
    SurfaceCondition.stoneDepth = stoneDepth;
    function verticalGradient(randomName, trueAtAndBelow, falseAtAndAbove) {
        return context => {
            const trueAtAndBelowY = trueAtAndBelow(context.context);
            const falseAtAndAboveY = falseAtAndAbove(context.context);
            if (context.blockY <= trueAtAndBelowY) {
                return true;
            }
            if (context.blockY >= falseAtAndAboveY) {
                return false;
            }
            const random = context.system.getRandom(randomName);
            const chance = map(context.blockY, trueAtAndBelowY, falseAtAndAboveY, 1, 0);
            return random.nextFloat() < chance;
        };
    }
    SurfaceCondition.verticalGradient = verticalGradient;
    function water(offset, surfaceDepthMultiplier, addStoneDepth) {
        return context => {
            if (context.waterHeight === Number.MIN_SAFE_INTEGER) {
                return true;
            }
            const stoneDepth = addStoneDepth ? context.stoneDepthAbove : 0;
            return context.blockY + stoneDepth >= context.waterHeight + offset + context.surfaceDepth * surfaceDepthMultiplier;
        };
    }
    SurfaceCondition.water = water;
    function yAbove(anchor, surfaceDepthMultiplier, addStoneDepth) {
        return context => {
            const stoneDepth = addStoneDepth ? context.stoneDepthAbove : 0;
            return context.blockY + stoneDepth >= anchor(context.context) + context.surfaceDepth * surfaceDepthMultiplier;
        };
    }
    SurfaceCondition.yAbove = yAbove;
})(SurfaceCondition || (SurfaceCondition = {}));
//# sourceMappingURL=SurfaceSystem.js.map