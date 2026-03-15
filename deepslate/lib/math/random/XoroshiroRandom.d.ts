import type { PositionalRandom, Random } from './Random.js';
export declare class XoroshiroRandom implements Random {
    private static readonly SILVER_RATIO_64;
    private static readonly GOLDEN_RATIO_64;
    private static readonly FLOAT_MULTIPLIER;
    private static readonly DOUBLE_MULTIPLIER;
    private static readonly BIGINT_1;
    private static readonly BIGINT_17;
    private static readonly BIGINT_21;
    private static readonly BIGINT_27;
    private static readonly BIGINT_28;
    private static readonly BIGINT_30;
    private static readonly BIGINT_31;
    private static readonly BIGINT_32;
    private static readonly BIGINT_49;
    private static readonly BIGINT_64;
    private static readonly STAFFORD_1;
    private static readonly STAFFORD_2;
    private static readonly MAX_ULONG;
    private static readonly POW2_60;
    private static readonly POW2_63;
    private static readonly MAX_UINT;
    private seed;
    constructor(seed: [bigint, bigint]);
    static create(seed: bigint): XoroshiroRandom;
    private static mixStafford13;
    private static upgradeSeedTo128bit;
    static rotateLeft(value: bigint, shift: bigint): bigint;
    setSeed(seed: bigint): void;
    fork(): XoroshiroRandom;
    forkPositional(): XoroshiroPositionalRandom;
    next(): bigint;
    nextLong(): bigint;
    consume(count: number): void;
    private nextBits;
    nextInt(max?: number): number;
    nextFloat(): number;
    nextDouble(): number;
    parityConfigString(): string;
}
export declare class XoroshiroPositionalRandom implements PositionalRandom {
    private readonly seedLo;
    private readonly seedHi;
    constructor(seedLo: bigint, seedHi: bigint);
    at(x: number, y: number, z: number): XoroshiroRandom;
    fromHashOf(name: string): XoroshiroRandom;
    seedKey(): [bigint, bigint];
}
//# sourceMappingURL=XoroshiroRandom.d.ts.map