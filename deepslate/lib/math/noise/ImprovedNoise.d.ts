import type { Random } from '../random/index.js';
export declare class ImprovedNoise {
    readonly p: number[];
    readonly xo: number;
    readonly yo: number;
    readonly zo: number;
    constructor(random: Random);
    sample(x: number, y: number, z: number, yScale?: number, yLimit?: number): number;
    private sampleAndLerp;
    private P;
}
//# sourceMappingURL=ImprovedNoise.d.ts.map