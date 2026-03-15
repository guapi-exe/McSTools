import type { PositionalRandom, Random } from './Random.js';
export declare class LegacyRandom implements Random {
    private static readonly MODULUS_BITS;
    private static readonly MODULUS_MASK;
    private static readonly MULTIPLIER;
    private static readonly INCREMENT;
    private static readonly FLOAT_MULTIPLIER;
    private static readonly DOUBLE_MULTIPLIER;
    private seed;
    constructor(seed: bigint);
    static fromLargeFeatureSeed(worldSeed: bigint, x: number, z: number): LegacyRandom;
    static fromLargeFeatureWithSalt(worldSeed: bigint, x: number, z: number, salt: number): LegacyRandom;
    fork(): LegacyRandom;
    forkPositional(): LegacyPositionalRandom;
    setSeed(seed: bigint): void;
    private advance;
    consume(count: number): void;
    protected next(bits: number): number;
    nextInt(max?: number): number;
    nextLong(): bigint;
    nextFloat(): number;
    nextDouble(): number;
}
export declare class LegacyPositionalRandom implements PositionalRandom {
    private readonly seed;
    constructor(seed: bigint);
    at(x: number, y: number, z: number): LegacyRandom;
    fromHashOf(name: string): LegacyRandom;
    seedKey(): [bigint, bigint];
}
//# sourceMappingURL=LegacyRandom.d.ts.map