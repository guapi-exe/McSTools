import { Json } from '../../util/index.js';
import { PerlinNoise } from './PerlinNoise.js';
export class NormalNoise {
    static INPUT_FACTOR = 1.0181268882175227;
    valueFactor;
    first;
    second;
    maxValue;
    constructor(random, { firstOctave, amplitudes }) {
        this.first = new PerlinNoise(random, firstOctave, amplitudes);
        this.second = new PerlinNoise(random, firstOctave, amplitudes);
        let min = +Infinity;
        let max = -Infinity;
        for (let i = 0; i < amplitudes.length; i += 1) {
            if (amplitudes[i] !== 0) {
                min = Math.min(min, i);
                max = Math.max(max, i);
            }
        }
        const expectedDeviation = 0.1 * (1 + 1 / (max - min + 1));
        this.valueFactor = (1 / 6) / expectedDeviation;
        this.maxValue = (this.first.maxValue + this.second.maxValue) * this.valueFactor;
    }
    sample(x, y, z) {
        const x2 = x * NormalNoise.INPUT_FACTOR;
        const y2 = y * NormalNoise.INPUT_FACTOR;
        const z2 = z * NormalNoise.INPUT_FACTOR;
        return (this.first.sample(x, y, z) + this.second.sample(x2, y2, z2)) * this.valueFactor;
    }
}
export var NoiseParameters;
(function (NoiseParameters) {
    function create(firstOctave, amplitudes) {
        return { firstOctave, amplitudes };
    }
    NoiseParameters.create = create;
    function fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        return {
            firstOctave: Json.readInt(root.firstOctave) ?? 0,
            amplitudes: Json.readArray(root.amplitudes, e => Json.readNumber(e) ?? 0) ?? [],
        };
    }
    NoiseParameters.fromJson = fromJson;
})(NoiseParameters || (NoiseParameters = {}));
//# sourceMappingURL=NormalNoise.js.map