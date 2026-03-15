import type { Random } from '../random/index.js';
import { ImprovedNoise } from './ImprovedNoise.js';
export declare class PerlinNoise {
    readonly noiseLevels: ImprovedNoise[];
    readonly amplitudes: number[];
    readonly lowestFreqInputFactor: number;
    readonly lowestFreqValueFactor: number;
    readonly maxValue: number;
    constructor(random: Random, firstOctave: number, amplitudes: number[], forceLegacy?: boolean);
    sample(x: number, y: number, z: number, yScale?: number, yLimit?: number, fixY?: boolean): number;
    getOctaveNoise(i: number): ImprovedNoise | undefined;
    edgeValue(x: number): number;
    static wrap(value: number): number;
}
//# sourceMappingURL=PerlinNoise.d.ts.map