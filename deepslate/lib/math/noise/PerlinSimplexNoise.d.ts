import type { Random } from '../random/index.js';
import { SimplexNoise } from './SimplexNoise.js';
export declare class PerlinSimplexNoise {
    readonly noiseLevels: SimplexNoise[];
    readonly highestFreqInputFactor: number;
    readonly highestFreqValueFactor: number;
    constructor(random: Random, octaves: number[]);
    sample(x: number, y: number, useOffsets: boolean): number;
}
//# sourceMappingURL=PerlinSimplexNoise.d.ts.map