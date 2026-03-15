import type { Chunk } from '../core/index.js';
import { BlockPos, BlockState } from '../core/index.js';
import type { Random } from '../math/index.js';
import type { NoiseChunk } from './NoiseChunk.js';
import type { NoiseSettings } from './NoiseSettings.js';
import { VerticalAnchor } from './VerticalAnchor.js';
export declare class SurfaceSystem {
    private readonly rule;
    private readonly defaultBlock;
    private readonly surfaceNoise;
    private readonly surfaceSecondaryNoise;
    private readonly random;
    private readonly positionalRandoms;
    constructor(rule: SurfaceRule, defaultBlock: BlockState, seed: bigint);
    buildSurface(chunk: Chunk, noiseChunk: NoiseChunk, worldgenContext: NoiseSettings, getBiome: (pos: BlockPos) => string): void;
    getSurfaceDepth(x: number, z: number): number;
    getSurfaceSecondary(x: number, z: number): number;
    getRandom(name: string): Random;
}
export declare class SurfaceContext {
    readonly system: SurfaceSystem;
    readonly chunk: Chunk;
    readonly noiseChunk: NoiseChunk;
    readonly context: NoiseSettings;
    private readonly getBiome;
    blockX: number;
    blockY: number;
    blockZ: number;
    stoneDepthAbove: number;
    stoneDepthBelow: number;
    surfaceDepth: number;
    waterHeight: number;
    biome: () => string;
    surfaceSecondary: () => number;
    minSurfaceLevel: () => number;
    constructor(system: SurfaceSystem, chunk: Chunk, noiseChunk: NoiseChunk, context: NoiseSettings, getBiome: (pos: BlockPos) => string);
    updateXZ(x: number, z: number): void;
    updateY(stoneDepthAbove: number, stoneDepthBelow: number, waterHeight: number, y: number): void;
    private calculateMinSurfaceLevel;
}
export declare type SurfaceRule = (context: SurfaceContext) => (x: number, y: number, z: number) => BlockState | undefined;
export declare namespace SurfaceRule {
    const NOOP: () => () => undefined;
    function fromJson(obj: unknown): SurfaceRule;
    function block(state: BlockState): SurfaceRule;
    function sequence(rules: SurfaceRule[]): SurfaceRule;
    function condition(ifTrue: SurfaceCondition, thenRun: SurfaceRule): SurfaceRule;
}
export declare type SurfaceCondition = (context: SurfaceContext) => boolean;
export declare namespace SurfaceCondition {
    const FALSE: () => boolean;
    const TRUE: () => boolean;
    function fromJson(obj: unknown): SurfaceCondition;
    function abovePreliminarySurface(): SurfaceCondition;
    function biome(biomes: string[]): SurfaceCondition;
    function not(invert: SurfaceCondition): SurfaceCondition;
    function stoneDepth(offset: number, addSurfaceDepth: boolean, secondaryDepthRange: number, ceiling: boolean): SurfaceCondition;
    function verticalGradient(randomName: string, trueAtAndBelow: VerticalAnchor, falseAtAndAbove: VerticalAnchor): SurfaceCondition;
    function water(offset: number, surfaceDepthMultiplier: number, addStoneDepth: boolean): SurfaceCondition;
    function yAbove(anchor: VerticalAnchor, surfaceDepthMultiplier: number, addStoneDepth: boolean): SurfaceCondition;
}
//# sourceMappingURL=SurfaceSystem.d.ts.map