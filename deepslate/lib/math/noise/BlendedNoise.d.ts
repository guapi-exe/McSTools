import type { Random } from '../random/index.js';
import { PerlinNoise } from './PerlinNoise.js';
export declare class BlendedNoise {
    readonly xzScale: number;
    readonly yScale: number;
    readonly xzFactor: number;
    readonly yFactor: number;
    readonly smearScaleMultiplier: number;
    readonly minLimitNoise: PerlinNoise;
    readonly maxLimitNoise: PerlinNoise;
    readonly mainNoise: PerlinNoise;
    private readonly xzMultiplier;
    private readonly yMultiplier;
    readonly maxValue: number;
    constructor(random: Random, xzScale: number, yScale: number, xzFactor: number, yFactor: number, smearScaleMultiplier: number);
    sample(x: number, y: number, z: number): number;
}
//# sourceMappingURL=BlendedNoise.d.ts.map