import type { Random } from '../random/index.js';
import { PerlinNoise } from './PerlinNoise.js';
export declare class NormalNoise {
    private static readonly INPUT_FACTOR;
    readonly valueFactor: number;
    readonly first: PerlinNoise;
    readonly second: PerlinNoise;
    readonly maxValue: number;
    constructor(random: Random, { firstOctave, amplitudes }: NoiseParameters);
    sample(x: number, y: number, z: number): number;
}
export declare type NoiseParameters = {
    firstOctave: number;
    amplitudes: number[];
};
export declare namespace NoiseParameters {
    function create(firstOctave: number, amplitudes: number[]): NoiseParameters;
    function fromJson(obj: unknown): NoiseParameters;
}
//# sourceMappingURL=NormalNoise.d.ts.map