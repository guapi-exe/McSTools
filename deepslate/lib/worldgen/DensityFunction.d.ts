import { Holder } from '../core/index.js';
import type { BlendedNoise, MinMaxNumberFunction, NormalNoise } from '../math/index.js';
import { CubicSpline, NoiseParameters } from '../math/index.js';
export declare abstract class DensityFunction implements MinMaxNumberFunction<DensityFunction.Context> {
    abstract compute(context: DensityFunction.Context): number;
    minValue(): number;
    abstract maxValue(): number;
    mapAll(visitor: DensityFunction.Visitor): DensityFunction;
}
export declare namespace DensityFunction {
    export interface Visitor {
        map: (density: DensityFunction) => DensityFunction;
    }
    export interface Context {
        x: number;
        y: number;
        z: number;
    }
    export function context(x: number, y: number, z: number): Context;
    abstract class Transformer extends DensityFunction {
        readonly input: DensityFunction;
        constructor(input: DensityFunction);
        abstract transform(context: Context, density: number): number;
        compute(context: Context): number;
    }
    export function fromJson(obj: unknown, inputParser?: (obj: unknown) => DensityFunction): DensityFunction;
    export class Constant extends DensityFunction {
        private readonly value;
        static ZERO: Constant;
        static ONE: Constant;
        constructor(value: number);
        compute(): number;
        minValue(): number;
        maxValue(): number;
    }
    export class HolderHolder extends DensityFunction {
        readonly holder: Holder<DensityFunction>;
        constructor(holder: Holder<DensityFunction>);
        compute(context: Context): number;
        minValue(): number;
        maxValue(): number;
    }
    export class ConstantMinMax extends DensityFunction.Constant {
        private readonly min;
        private readonly max;
        constructor(value: number, min: number, max: number);
        minValue(): number;
        maxValue(): number;
    }
    export class OldBlendedNoise extends DensityFunction {
        readonly xzScale: number;
        readonly yScale: number;
        readonly xzFactor: number;
        readonly yFactor: number;
        readonly smearScaleMultiplier: number;
        private readonly blendedNoise?;
        constructor(xzScale: number, yScale: number, xzFactor: number, yFactor: number, smearScaleMultiplier: number, blendedNoise?: BlendedNoise | undefined);
        compute(context: Context): number;
        maxValue(): number;
    }
    abstract class Wrapper extends DensityFunction {
        protected readonly wrapped: DensityFunction;
        constructor(wrapped: DensityFunction);
        minValue(): number;
        maxValue(): number;
    }
    export class FlatCache extends Wrapper {
        private lastQuartX?;
        private lastQuartZ?;
        private lastValue;
        constructor(wrapped: DensityFunction);
        compute(context: Context): number;
        mapAll(visitor: Visitor): DensityFunction;
    }
    export class CacheAllInCell extends Wrapper {
        constructor(wrapped: DensityFunction);
        compute(context: Context): number;
        mapAll(visitor: Visitor): DensityFunction;
    }
    export class Cache2D extends Wrapper {
        private lastBlockX?;
        private lastBlockZ?;
        private lastValue;
        constructor(wrapped: DensityFunction);
        compute(context: Context): number;
        mapAll(visitor: Visitor): DensityFunction;
    }
    export class CacheOnce extends Wrapper {
        private lastBlockX?;
        private lastBlockY?;
        private lastBlockZ?;
        private lastValue;
        constructor(wrapped: DensityFunction);
        compute(context: DensityFunction.Context): number;
        mapAll(visitor: Visitor): DensityFunction;
    }
    export class Interpolated extends Wrapper {
        private readonly cellWidth;
        private readonly cellHeight;
        private readonly values;
        constructor(wrapped: DensityFunction, cellWidth?: number, cellHeight?: number);
        compute({ x: blockX, y: blockY, z: blockZ }: DensityFunction.Context): number;
        private computeCorner;
        mapAll(visitor: Visitor): DensityFunction;
        withCellSize(cellWidth: number, cellHeight: number): Interpolated;
    }
    export class Noise extends DensityFunction {
        readonly xzScale: number;
        readonly yScale: number;
        readonly noiseData: Holder<NoiseParameters>;
        readonly noise?: NormalNoise | undefined;
        constructor(xzScale: number, yScale: number, noiseData: Holder<NoiseParameters>, noise?: NormalNoise | undefined);
        compute(context: Context): number;
        maxValue(): number;
    }
    export class EndIslands extends DensityFunction {
        private readonly islandNoise;
        constructor(seed?: bigint);
        private getHeightValue;
        compute({ x, y, z }: DensityFunction.Context): number;
        minValue(): number;
        maxValue(): number;
    }
    const RarityValueMapper: readonly ["type_1", "type_2"];
    export class WeirdScaledSampler extends Transformer {
        readonly rarityValueMapper: typeof RarityValueMapper[number];
        readonly noiseData: Holder<NoiseParameters>;
        readonly noise?: NormalNoise | undefined;
        private static readonly ValueMapper;
        private readonly mapper;
        constructor(input: DensityFunction, rarityValueMapper: typeof RarityValueMapper[number], noiseData: Holder<NoiseParameters>, noise?: NormalNoise | undefined);
        transform(context: Context, density: number): number;
        mapAll(visitor: Visitor): DensityFunction;
        minValue(): number;
        maxValue(): number;
        static rarityValueMapper1(value: number): 2 | 1 | 1.5 | 0.75;
        static rarityValueMapper2(value: number): 2 | 1 | 3 | 0.5 | 0.75;
    }
    export class ShiftedNoise extends Noise {
        readonly shiftX: DensityFunction;
        readonly shiftY: DensityFunction;
        readonly shiftZ: DensityFunction;
        constructor(shiftX: DensityFunction, shiftY: DensityFunction, shiftZ: DensityFunction, xzScale: number, yScale: number, noiseData: Holder<NoiseParameters>, noise?: NormalNoise);
        compute(context: Context): number;
        mapAll(visitor: Visitor): DensityFunction;
    }
    export class RangeChoice extends DensityFunction {
        readonly input: DensityFunction;
        readonly minInclusive: number;
        readonly maxExclusive: number;
        readonly whenInRange: DensityFunction;
        readonly whenOutOfRange: DensityFunction;
        constructor(input: DensityFunction, minInclusive: number, maxExclusive: number, whenInRange: DensityFunction, whenOutOfRange: DensityFunction);
        compute(context: Context): number;
        mapAll(visitor: Visitor): DensityFunction;
        minValue(): number;
        maxValue(): number;
    }
    export abstract class ShiftNoise extends DensityFunction {
        readonly noiseData: Holder<NoiseParameters>;
        readonly offsetNoise?: NormalNoise | undefined;
        constructor(noiseData: Holder<NoiseParameters>, offsetNoise?: NormalNoise | undefined);
        compute(context: Context): number;
        maxValue(): number;
        abstract withNewNoise(noise: NormalNoise): ShiftNoise;
    }
    export class ShiftA extends ShiftNoise {
        constructor(noiseData: Holder<NoiseParameters>, offsetNoise?: NormalNoise);
        compute(context: Context): number;
        withNewNoise(newNoise: NormalNoise): ShiftA;
    }
    export class ShiftB extends ShiftNoise {
        constructor(noiseData: Holder<NoiseParameters>, offsetNoise?: NormalNoise);
        compute(context: Context): number;
        withNewNoise(newNoise: NormalNoise): ShiftB;
    }
    export class Shift extends ShiftNoise {
        constructor(noiseData: Holder<NoiseParameters>, offsetNoise?: NormalNoise);
        withNewNoise(newNoise: NormalNoise): Shift;
    }
    export class BlendDensity extends Transformer {
        constructor(input: DensityFunction);
        transform(context: Context, density: number): number;
        mapAll(visitor: Visitor): DensityFunction;
        minValue(): number;
        maxValue(): number;
    }
    export class Clamp extends Transformer {
        readonly min: number;
        readonly max: number;
        constructor(input: DensityFunction, min: number, max: number);
        transform(context: Context, density: number): number;
        mapAll(visitor: Visitor): DensityFunction;
        minValue(): number;
        maxValue(): number;
    }
    const MappedType: readonly ["abs", "square", "cube", "half_negative", "quarter_negative", "squeeze"];
    export class Mapped extends Transformer {
        readonly type: typeof MappedType[number];
        private readonly min?;
        private readonly max?;
        private static readonly MappedTypes;
        private readonly transformer;
        constructor(type: typeof MappedType[number], input: DensityFunction, min?: number | undefined, max?: number | undefined);
        transform(context: Context, density: number): number;
        mapAll(visitor: Visitor): DensityFunction;
        minValue(): number;
        maxValue(): number;
        withMinMax(): Mapped;
    }
    const Ap2Type: readonly ["add", "mul", "min", "max"];
    export class Ap2 extends DensityFunction {
        readonly type: typeof Ap2Type[number];
        readonly argument1: DensityFunction;
        readonly argument2: DensityFunction;
        private readonly min?;
        private readonly max?;
        constructor(type: typeof Ap2Type[number], argument1: DensityFunction, argument2: DensityFunction, min?: number | undefined, max?: number | undefined);
        compute(context: Context): number;
        mapAll(visitor: Visitor): DensityFunction;
        minValue(): number;
        maxValue(): number;
        withMinMax(): Ap2;
    }
    export class Spline extends DensityFunction {
        readonly spline: CubicSpline<Context>;
        constructor(spline: CubicSpline<Context>);
        compute(context: Context): number;
        mapAll(visitor: Visitor): DensityFunction;
        minValue(): number;
        maxValue(): number;
    }
    export class YClampedGradient extends DensityFunction {
        readonly fromY: number;
        readonly toY: number;
        readonly fromValue: number;
        readonly toValue: number;
        constructor(fromY: number, toY: number, fromValue: number, toValue: number);
        compute(context: Context): number;
        minValue(): number;
        maxValue(): number;
    }
    export {};
}
//# sourceMappingURL=DensityFunction.d.ts.map