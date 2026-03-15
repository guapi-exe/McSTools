import type { Random } from '../random/index.js';
export declare class SimplexNoise {
    private static readonly GRADIENT;
    private static readonly F2;
    private static readonly G2;
    readonly p: number[];
    readonly xo: number;
    readonly yo: number;
    readonly zo: number;
    constructor(random: Random);
    sample2D(d: number, d2: number): number;
    sample(x: number, y: number, z: number): number;
    private P;
    private getCornerNoise3D;
    static gradDot(a: number, b: number, c: number, d: number): number;
}
//# sourceMappingURL=SimplexNoise.d.ts.map