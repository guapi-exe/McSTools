import { clampedLerp } from '../Util.js';
import { PerlinNoise } from './PerlinNoise.js';
export class BlendedNoise {
    xzScale;
    yScale;
    xzFactor;
    yFactor;
    smearScaleMultiplier;
    minLimitNoise;
    maxLimitNoise;
    mainNoise;
    xzMultiplier;
    yMultiplier;
    maxValue;
    constructor(random, xzScale, yScale, xzFactor, yFactor, smearScaleMultiplier) {
        this.xzScale = xzScale;
        this.yScale = yScale;
        this.xzFactor = xzFactor;
        this.yFactor = yFactor;
        this.smearScaleMultiplier = smearScaleMultiplier;
        this.minLimitNoise = new PerlinNoise(random, -15, [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], true);
        this.maxLimitNoise = new PerlinNoise(random, -15, [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], true);
        this.mainNoise = new PerlinNoise(random, -7, [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], true);
        this.xzMultiplier = 684.412 * xzScale;
        this.yMultiplier = 684.412 * yScale;
        this.maxValue = this.minLimitNoise.edgeValue(this.yMultiplier + 2);
    }
    sample(x, y, z) {
        const scaledX = x * this.xzMultiplier;
        const scaledY = y * this.yMultiplier;
        const scaledZ = z * this.xzMultiplier;
        const factoredX = scaledX / this.xzFactor;
        const factoredY = scaledY / this.yFactor;
        const factoredZ = scaledZ / this.xzFactor;
        const smear = this.yMultiplier * this.smearScaleMultiplier;
        const factoredSmear = smear / this.yFactor;
        let noise;
        let value = 0;
        let factor = 1;
        for (let i = 0; i < 8; i += 1) {
            noise = this.mainNoise.getOctaveNoise(i);
            if (noise) {
                const xx = PerlinNoise.wrap(factoredX * factor);
                const yy = PerlinNoise.wrap(factoredY * factor);
                const zz = PerlinNoise.wrap(factoredZ * factor);
                value += noise.sample(xx, yy, zz, factoredSmear * factor, factoredY * factor) / factor;
            }
            factor /= 2;
        }
        value = (value / 10 + 1) / 2;
        factor = 1;
        let min = 0;
        let max = 0;
        for (let i = 0; i < 16; i += 1) {
            const xx = PerlinNoise.wrap(scaledX * factor);
            const yy = PerlinNoise.wrap(scaledY * factor);
            const zz = PerlinNoise.wrap(scaledZ * factor);
            const smearsmear = smear * factor;
            if (value < 1 && (noise = this.minLimitNoise.getOctaveNoise(i))) {
                min += noise.sample(xx, yy, zz, smearsmear, scaledY * factor) / factor;
            }
            if (value > 0 && (noise = this.maxLimitNoise.getOctaveNoise(i))) {
                max += noise.sample(xx, yy, zz, smearsmear, scaledY * factor) / factor;
            }
            factor /= 2;
        }
        return clampedLerp(min / 512, max / 512, value) / 128;
    }
}
//# sourceMappingURL=BlendedNoise.js.map