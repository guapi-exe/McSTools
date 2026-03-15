import { Holder, Identifier } from '../core/index.js';
import { CubicSpline, LegacyRandom, NoiseParameters, SimplexNoise, clamp, clampedMap, lazyLerp3 } from '../math/index.js';
import { Json, computeIfAbsent } from '../util/index.js';
import { WorldgenRegistries } from './WorldgenRegistries.js';
export class DensityFunction {
    minValue() {
        return -this.maxValue();
    }
    mapAll(visitor) {
        return visitor.map(this);
    }
}
(function (DensityFunction) {
    function context(x, y, z) {
        return {
            x,
            y,
            z,
        };
    }
    DensityFunction.context = context;
    class Transformer extends DensityFunction {
        input;
        constructor(input) {
            super();
            this.input = input;
        }
        compute(context) {
            return this.transform(context, this.input.compute(context));
        }
    }
    const NoiseParser = Holder.parser(WorldgenRegistries.NOISE, NoiseParameters.fromJson);
    function fromJson(obj, inputParser = fromJson) {
        if (typeof obj === 'string') {
            return new HolderHolder(Holder.reference(WorldgenRegistries.DENSITY_FUNCTION, Identifier.parse(obj)));
        }
        if (typeof obj === 'number') {
            return new Constant(obj);
        }
        const root = Json.readObject(obj) ?? {};
        const type = Json.readString(root.type)?.replace(/^minecraft:/, '');
        switch (type) {
            case 'blend_alpha': return new ConstantMinMax(1, 0, 1);
            case 'blend_offset': return new ConstantMinMax(0, -Infinity, Infinity);
            case 'beardifier': return new ConstantMinMax(0, -Infinity, Infinity);
            case 'old_blended_noise': return new OldBlendedNoise(Json.readNumber(root.xz_scale) ?? 1, Json.readNumber(root.y_scale) ?? 1, Json.readNumber(root.xz_factor) ?? 80, Json.readNumber(root.y_factor) ?? 160, Json.readNumber(root.smear_scale_multiplier) ?? 8);
            case 'flat_cache': return new FlatCache(inputParser(root.argument));
            case 'interpolated': return new Interpolated(inputParser(root.argument));
            case 'cache_2d': return new Cache2D(inputParser(root.argument));
            case 'cache_once': return new CacheOnce(inputParser(root.argument));
            case 'cache_all_in_cell': return new CacheAllInCell(inputParser(root.argument));
            case 'noise': return new Noise(Json.readNumber(root.xz_scale) ?? 1, Json.readNumber(root.y_scale) ?? 1, NoiseParser(root.noise));
            case 'end_islands': return new EndIslands();
            case 'weird_scaled_sampler': return new WeirdScaledSampler(inputParser(root.input), Json.readEnum(root.rarity_value_mapper, RarityValueMapper), NoiseParser(root.noise));
            case 'shifted_noise': return new ShiftedNoise(inputParser(root.shift_x), inputParser(root.shift_y), inputParser(root.shift_z), Json.readNumber(root.xz_scale) ?? 1, Json.readNumber(root.y_scale) ?? 1, NoiseParser(root.noise));
            case 'range_choice': return new RangeChoice(inputParser(root.input), Json.readNumber(root.min_inclusive) ?? 0, Json.readNumber(root.max_exclusive) ?? 1, inputParser(root.when_in_range), inputParser(root.when_out_of_range));
            case 'shift_a': return new ShiftA(NoiseParser(root.argument));
            case 'shift_b': return new ShiftB(NoiseParser(root.argument));
            case 'shift': return new Shift(NoiseParser(root.argument));
            case 'blend_density': return new BlendDensity(inputParser(root.argument));
            case 'clamp': return new Clamp(inputParser(root.input), Json.readNumber(root.min) ?? 0, Json.readNumber(root.max) ?? 1);
            case 'abs':
            case 'square':
            case 'cube':
            case 'half_negative':
            case 'quarter_negative':
            case 'squeeze':
                return new Mapped(type, inputParser(root.argument));
            case 'add':
            case 'mul':
            case 'min':
            case 'max': return new Ap2(Json.readEnum(type, Ap2Type), inputParser(root.argument1), inputParser(root.argument2));
            case 'spline': return new Spline(CubicSpline.fromJson(root.spline, inputParser));
            case 'constant': return new Constant(Json.readNumber(root.argument) ?? 0);
            case 'y_clamped_gradient': return new YClampedGradient(Json.readInt(root.from_y) ?? -4064, Json.readInt(root.to_y) ?? 4062, Json.readNumber(root.from_value) ?? -4064, Json.readNumber(root.to_value) ?? 4062);
        }
        return Constant.ZERO;
    }
    DensityFunction.fromJson = fromJson;
    class Constant extends DensityFunction {
        value;
        static ZERO = new Constant(0);
        static ONE = new Constant(1);
        constructor(value) {
            super();
            this.value = value;
        }
        compute() {
            return this.value;
        }
        minValue() {
            return this.value;
        }
        maxValue() {
            return this.value;
        }
    }
    DensityFunction.Constant = Constant;
    class HolderHolder extends DensityFunction {
        holder;
        constructor(holder) {
            super();
            this.holder = holder;
        }
        compute(context) {
            return this.holder.value().compute(context);
        }
        minValue() {
            return this.holder.value().minValue();
        }
        maxValue() {
            return this.holder.value().maxValue();
        }
    }
    DensityFunction.HolderHolder = HolderHolder;
    class ConstantMinMax extends DensityFunction.Constant {
        min;
        max;
        constructor(value, min, max) {
            super(value);
            this.min = min;
            this.max = max;
        }
        minValue() {
            return this.min;
        }
        maxValue() {
            return this.max;
        }
    }
    DensityFunction.ConstantMinMax = ConstantMinMax;
    class OldBlendedNoise extends DensityFunction {
        xzScale;
        yScale;
        xzFactor;
        yFactor;
        smearScaleMultiplier;
        blendedNoise;
        constructor(xzScale, yScale, xzFactor, yFactor, smearScaleMultiplier, blendedNoise) {
            super();
            this.xzScale = xzScale;
            this.yScale = yScale;
            this.xzFactor = xzFactor;
            this.yFactor = yFactor;
            this.smearScaleMultiplier = smearScaleMultiplier;
            this.blendedNoise = blendedNoise;
        }
        compute(context) {
            return this.blendedNoise?.sample(context.x, context.y, context.z) ?? 0;
        }
        maxValue() {
            return this.blendedNoise?.maxValue ?? 0;
        }
    }
    DensityFunction.OldBlendedNoise = OldBlendedNoise;
    class Wrapper extends DensityFunction {
        wrapped;
        constructor(wrapped) {
            super();
            this.wrapped = wrapped;
        }
        minValue() {
            return this.wrapped.minValue();
        }
        maxValue() {
            return this.wrapped.maxValue();
        }
    }
    class FlatCache extends Wrapper {
        lastQuartX;
        lastQuartZ;
        lastValue = 0;
        constructor(wrapped) {
            super(wrapped);
        }
        compute(context) {
            const quartX = context.x >> 2;
            const quartZ = context.z >> 2;
            if (this.lastQuartX !== quartX || this.lastQuartZ !== quartZ) {
                this.lastValue = this.wrapped.compute(DensityFunction.context(quartX << 2, 0, quartZ << 2));
                this.lastQuartX = quartX;
                this.lastQuartZ = quartZ;
            }
            return this.lastValue;
        }
        mapAll(visitor) {
            return visitor.map(new FlatCache(this.wrapped.mapAll(visitor)));
        }
    }
    DensityFunction.FlatCache = FlatCache;
    class CacheAllInCell extends Wrapper {
        constructor(wrapped) {
            super(wrapped);
        }
        compute(context) {
            return this.wrapped.compute(context);
        }
        mapAll(visitor) {
            return visitor.map(new CacheAllInCell(this.wrapped.mapAll(visitor)));
        }
    }
    DensityFunction.CacheAllInCell = CacheAllInCell;
    class Cache2D extends Wrapper {
        lastBlockX;
        lastBlockZ;
        lastValue = 0;
        constructor(wrapped) {
            super(wrapped);
        }
        compute(context) {
            const blockX = context.x;
            const blockZ = context.z;
            if (this.lastBlockX !== blockX || this.lastBlockZ !== blockZ) {
                this.lastValue = this.wrapped.compute(context);
                this.lastBlockX = blockX;
                this.lastBlockZ = blockZ;
            }
            return this.lastValue;
        }
        mapAll(visitor) {
            return visitor.map(new Cache2D(this.wrapped.mapAll(visitor)));
        }
    }
    DensityFunction.Cache2D = Cache2D;
    class CacheOnce extends Wrapper {
        lastBlockX;
        lastBlockY;
        lastBlockZ;
        lastValue = 0;
        constructor(wrapped) {
            super(wrapped);
        }
        compute(context) {
            const blockX = context.x;
            const blockY = context.y;
            const blockZ = context.z;
            if (this.lastBlockX !== blockX || this.lastBlockY !== blockY || this.lastBlockZ !== blockZ) {
                this.lastValue = this.wrapped.compute(context);
                this.lastBlockX = blockX;
                this.lastBlockY = blockY;
                this.lastBlockZ = blockZ;
            }
            return this.lastValue;
        }
        mapAll(visitor) {
            return visitor.map(new CacheOnce(this.wrapped.mapAll(visitor)));
        }
    }
    DensityFunction.CacheOnce = CacheOnce;
    class Interpolated extends Wrapper {
        cellWidth;
        cellHeight;
        values;
        constructor(wrapped, cellWidth = 4, cellHeight = 4) {
            super(wrapped);
            this.cellWidth = cellWidth;
            this.cellHeight = cellHeight;
            this.values = new Map();
        }
        compute({ x: blockX, y: blockY, z: blockZ }) {
            const w = this.cellWidth;
            const h = this.cellHeight;
            const x = ((blockX % w + w) % w) / w;
            const y = ((blockY % h + h) % h) / h;
            const z = ((blockZ % w + w) % w) / w;
            const firstX = Math.floor(blockX / w) * w;
            const firstY = Math.floor(blockY / h) * h;
            const firstZ = Math.floor(blockZ / w) * w;
            const noise000 = () => this.computeCorner(firstX, firstY, firstZ);
            const noise001 = () => this.computeCorner(firstX, firstY, firstZ + w);
            const noise010 = () => this.computeCorner(firstX, firstY + h, firstZ);
            const noise011 = () => this.computeCorner(firstX, firstY + h, firstZ + w);
            const noise100 = () => this.computeCorner(firstX + w, firstY, firstZ);
            const noise101 = () => this.computeCorner(firstX + w, firstY, firstZ + w);
            const noise110 = () => this.computeCorner(firstX + w, firstY + h, firstZ);
            const noise111 = () => this.computeCorner(firstX + w, firstY + h, firstZ + w);
            return lazyLerp3(x, y, z, noise000, noise100, noise010, noise110, noise001, noise101, noise011, noise111);
        }
        computeCorner(x, y, z) {
            return computeIfAbsent(this.values, `${x} ${y} ${z}`, () => {
                return this.wrapped.compute(DensityFunction.context(x, y, z));
            });
        }
        mapAll(visitor) {
            return visitor.map(new Interpolated(this.wrapped.mapAll(visitor)));
        }
        withCellSize(cellWidth, cellHeight) {
            return new Interpolated(this.wrapped, cellWidth, cellHeight);
        }
    }
    DensityFunction.Interpolated = Interpolated;
    class Noise extends DensityFunction {
        xzScale;
        yScale;
        noiseData;
        noise;
        constructor(xzScale, yScale, noiseData, noise) {
            super();
            this.xzScale = xzScale;
            this.yScale = yScale;
            this.noiseData = noiseData;
            this.noise = noise;
        }
        compute(context) {
            return this.noise?.sample(context.x * this.xzScale, context.y * this.yScale, context.z * this.xzScale) ?? 0;
        }
        maxValue() {
            return this.noise?.maxValue ?? 2;
        }
    }
    DensityFunction.Noise = Noise;
    class EndIslands extends DensityFunction {
        islandNoise;
        constructor(seed) {
            super();
            const random = new LegacyRandom(seed ?? BigInt(0));
            random.consume(17292);
            this.islandNoise = new SimplexNoise(random);
        }
        getHeightValue(x, z) {
            const x0 = Math.floor(x / 2);
            const z0 = Math.floor(z / 2);
            const x1 = x % 2;
            const z1 = z % 2;
            let f = clamp(100 - Math.sqrt(x * x + z * z) * 8, -100, 80);
            for (let i = -12; i <= 12; i += 1) {
                for (let j = -12; j <= 12; j += 1) {
                    const x2 = x0 + i;
                    const z2 = z0 + j;
                    if (x2 * x2 + z2 * z2 <= 4096 || this.islandNoise.sample2D(x2, z2) >= -0.9) {
                        continue;
                    }
                    const f1 = (Math.abs(x2) * 3439 + Math.abs(z2) * 147) % 13 + 9;
                    const x3 = x1 + i * 2;
                    const z3 = z1 + j * 2;
                    const f2 = 100 - Math.sqrt(x3 * x3 + z3 * z3) * f1;
                    const f3 = clamp(f2, -100, 80);
                    f = Math.max(f, f3);
                }
            }
            return f;
        }
        compute({ x, y, z }) {
            return (this.getHeightValue(Math.floor(x / 8), Math.floor(z / 8)) - 8) / 128;
        }
        minValue() {
            return -0.84375;
        }
        maxValue() {
            return 0.5625;
        }
    }
    DensityFunction.EndIslands = EndIslands;
    const RarityValueMapper = ['type_1', 'type_2'];
    class WeirdScaledSampler extends Transformer {
        rarityValueMapper;
        noiseData;
        noise;
        static ValueMapper = {
            type_1: WeirdScaledSampler.rarityValueMapper1,
            type_2: WeirdScaledSampler.rarityValueMapper2,
        };
        mapper;
        constructor(input, rarityValueMapper, noiseData, noise) {
            super(input);
            this.rarityValueMapper = rarityValueMapper;
            this.noiseData = noiseData;
            this.noise = noise;
            this.mapper = WeirdScaledSampler.ValueMapper[this.rarityValueMapper];
        }
        transform(context, density) {
            if (!this.noise) {
                return 0;
            }
            const rarity = this.mapper(density);
            return rarity * Math.abs(this.noise.sample(context.x / rarity, context.y / rarity, context.z / rarity));
        }
        mapAll(visitor) {
            return visitor.map(new WeirdScaledSampler(this.input.mapAll(visitor), this.rarityValueMapper, this.noiseData, this.noise));
        }
        minValue() {
            return 0;
        }
        maxValue() {
            return this.rarityValueMapper === 'type_1' ? 2 : 3;
        }
        static rarityValueMapper1(value) {
            if (value < -0.5) {
                return 0.75;
            }
            else if (value < 0) {
                return 1;
            }
            else if (value < 0.5) {
                return 1.5;
            }
            else {
                return 2;
            }
        }
        static rarityValueMapper2(value) {
            if (value < -0.75) {
                return 0.5;
            }
            else if (value < -0.5) {
                return 0.75;
            }
            else if (value < 0.5) {
                return 1;
            }
            else if (value < 0.75) {
                return 2;
            }
            else {
                return 3;
            }
        }
    }
    DensityFunction.WeirdScaledSampler = WeirdScaledSampler;
    class ShiftedNoise extends Noise {
        shiftX;
        shiftY;
        shiftZ;
        constructor(shiftX, shiftY, shiftZ, xzScale, yScale, noiseData, noise) {
            super(xzScale, yScale, noiseData, noise);
            this.shiftX = shiftX;
            this.shiftY = shiftY;
            this.shiftZ = shiftZ;
        }
        compute(context) {
            const xx = context.x * this.xzScale + this.shiftX.compute(context);
            const yy = context.y * this.yScale + this.shiftY.compute(context);
            const zz = context.z * this.xzScale + this.shiftZ.compute(context);
            return this.noise?.sample(xx, yy, zz) ?? 0;
        }
        mapAll(visitor) {
            return visitor.map(new ShiftedNoise(this.shiftX.mapAll(visitor), this.shiftY.mapAll(visitor), this.shiftZ.mapAll(visitor), this.xzScale, this.yScale, this.noiseData, this.noise));
        }
    }
    DensityFunction.ShiftedNoise = ShiftedNoise;
    class RangeChoice extends DensityFunction {
        input;
        minInclusive;
        maxExclusive;
        whenInRange;
        whenOutOfRange;
        constructor(input, minInclusive, maxExclusive, whenInRange, whenOutOfRange) {
            super();
            this.input = input;
            this.minInclusive = minInclusive;
            this.maxExclusive = maxExclusive;
            this.whenInRange = whenInRange;
            this.whenOutOfRange = whenOutOfRange;
        }
        compute(context) {
            const x = this.input.compute(context);
            return (this.minInclusive <= x && x < this.maxExclusive)
                ? this.whenInRange.compute(context)
                : this.whenOutOfRange.compute(context);
        }
        mapAll(visitor) {
            return visitor.map(new RangeChoice(this.input.mapAll(visitor), this.minInclusive, this.maxExclusive, this.whenInRange.mapAll(visitor), this.whenOutOfRange.mapAll(visitor)));
        }
        minValue() {
            return Math.min(this.whenInRange.minValue(), this.whenOutOfRange.minValue());
        }
        maxValue() {
            return Math.max(this.whenInRange.maxValue(), this.whenOutOfRange.maxValue());
        }
    }
    DensityFunction.RangeChoice = RangeChoice;
    class ShiftNoise extends DensityFunction {
        noiseData;
        offsetNoise;
        constructor(noiseData, offsetNoise) {
            super();
            this.noiseData = noiseData;
            this.offsetNoise = offsetNoise;
        }
        compute(context) {
            return (this.offsetNoise?.sample(context.x * 0.25, context.y * 0.25, context.z * 0.25) ?? 0) * 4;
        }
        maxValue() {
            return (this.offsetNoise?.maxValue ?? 2) * 4;
        }
    }
    DensityFunction.ShiftNoise = ShiftNoise;
    class ShiftA extends ShiftNoise {
        constructor(noiseData, offsetNoise) {
            super(noiseData, offsetNoise);
        }
        compute(context) {
            return super.compute(DensityFunction.context(context.x, 0, context.z));
        }
        withNewNoise(newNoise) {
            return new ShiftA(this.noiseData, newNoise);
        }
    }
    DensityFunction.ShiftA = ShiftA;
    class ShiftB extends ShiftNoise {
        constructor(noiseData, offsetNoise) {
            super(noiseData, offsetNoise);
        }
        compute(context) {
            return super.compute(DensityFunction.context(context.z, context.x, 0));
        }
        withNewNoise(newNoise) {
            return new ShiftB(this.noiseData, newNoise);
        }
    }
    DensityFunction.ShiftB = ShiftB;
    class Shift extends ShiftNoise {
        constructor(noiseData, offsetNoise) {
            super(noiseData, offsetNoise);
        }
        withNewNoise(newNoise) {
            return new Shift(this.noiseData, newNoise);
        }
    }
    DensityFunction.Shift = Shift;
    class BlendDensity extends Transformer {
        constructor(input) {
            super(input);
        }
        transform(context, density) {
            return density; // blender not supported
        }
        mapAll(visitor) {
            return visitor.map(new BlendDensity(this.input.mapAll(visitor)));
        }
        minValue() {
            return -Infinity;
        }
        maxValue() {
            return Infinity;
        }
    }
    DensityFunction.BlendDensity = BlendDensity;
    class Clamp extends Transformer {
        min;
        max;
        constructor(input, min, max) {
            super(input);
            this.min = min;
            this.max = max;
        }
        transform(context, density) {
            return clamp(density, this.min, this.max);
        }
        mapAll(visitor) {
            return visitor.map(new Clamp(this.input.mapAll(visitor), this.min, this.max));
        }
        minValue() {
            return this.min;
        }
        maxValue() {
            return this.max;
        }
    }
    DensityFunction.Clamp = Clamp;
    const MappedType = ['abs', 'square', 'cube', 'half_negative', 'quarter_negative', 'squeeze'];
    class Mapped extends Transformer {
        type;
        min;
        max;
        static MappedTypes = {
            abs: d => Math.abs(d),
            square: d => d * d,
            cube: d => d * d * d,
            half_negative: d => d > 0 ? d : d * 0.5,
            quarter_negative: d => d > 0 ? d : d * 0.25,
            squeeze: d => {
                const c = clamp(d, -1, 1);
                return c / 2 - c * c * c / 24;
            },
        };
        transformer;
        constructor(type, input, min, max) {
            super(input);
            this.type = type;
            this.min = min;
            this.max = max;
            this.transformer = Mapped.MappedTypes[this.type];
        }
        transform(context, density) {
            return this.transformer(density);
        }
        mapAll(visitor) {
            return visitor.map(new Mapped(this.type, this.input.mapAll(visitor)));
        }
        minValue() {
            return this.min ?? -Infinity;
        }
        maxValue() {
            return this.max ?? Infinity;
        }
        withMinMax() {
            const minInput = this.input.minValue();
            let min = this.transformer(minInput);
            let max = this.transformer(this.input.maxValue());
            if (this.type === 'abs' || this.type === 'square') {
                max = Math.max(min, max);
                min = Math.max(0, minInput);
            }
            return new Mapped(this.type, this.input, min, max);
        }
    }
    DensityFunction.Mapped = Mapped;
    const Ap2Type = ['add', 'mul', 'min', 'max'];
    class Ap2 extends DensityFunction {
        type;
        argument1;
        argument2;
        min;
        max;
        constructor(type, argument1, argument2, min, max) {
            super();
            this.type = type;
            this.argument1 = argument1;
            this.argument2 = argument2;
            this.min = min;
            this.max = max;
        }
        compute(context) {
            const a = this.argument1.compute(context);
            switch (this.type) {
                case 'add': return a + this.argument2.compute(context);
                case 'mul': return a === 0 ? 0 : a * this.argument2.compute(context);
                case 'min': return a < this.argument2.minValue() ? a : Math.min(a, this.argument2.compute(context));
                case 'max': return a > this.argument2.maxValue() ? a : Math.max(a, this.argument2.compute(context));
            }
        }
        mapAll(visitor) {
            return visitor.map(new Ap2(this.type, this.argument1.mapAll(visitor), this.argument2.mapAll(visitor)));
        }
        minValue() {
            return this.min ?? -Infinity;
        }
        maxValue() {
            return this.max ?? Infinity;
        }
        withMinMax() {
            const min1 = this.argument1.minValue();
            const min2 = this.argument2.minValue();
            const max1 = this.argument1.maxValue();
            const max2 = this.argument2.maxValue();
            if ((this.type === 'min' || this.type === 'max') && (min1 >= max2 || min2 >= max1)) {
                console.warn(`Creating a ${this.type} function between two non-overlapping inputs`);
            }
            let min, max;
            switch (this.type) {
                case 'add':
                    min = min1 + min2;
                    max = max1 + max2;
                    break;
                case 'mul':
                    min = min1 > 0 && min2 > 0 ? (min1 * min2) || 0
                        : max1 < 0 && max2 < 0 ? (max1 * max2) || 0
                            : Math.min((min1 * max2) || 0, (min2 * max1) || 0);
                    max = min1 > 0 && min2 > 0 ? (max1 * max2) || 0
                        : max1 < 0 && max2 < 0 ? (min1 * min2) || 0
                            : Math.max((min1 * min2) || 0, (max1 * max2) || 0);
                    break;
                case 'min':
                    min = Math.min(min1, min2);
                    max = Math.min(max1, max2);
                    break;
                case 'max':
                    min = Math.max(min1, min2);
                    max = Math.max(max1, max2);
                    break;
            }
            return new Ap2(this.type, this.argument1, this.argument2, min, max);
        }
    }
    DensityFunction.Ap2 = Ap2;
    class Spline extends DensityFunction {
        spline;
        constructor(spline) {
            super();
            this.spline = spline;
        }
        compute(context) {
            return this.spline.compute(context);
        }
        mapAll(visitor) {
            const newCubicSpline = this.spline.mapAll((fn) => {
                if (fn instanceof DensityFunction) {
                    return fn.mapAll(visitor);
                }
                return fn;
            });
            newCubicSpline.calculateMinMax();
            return visitor.map(new Spline(newCubicSpline));
        }
        minValue() {
            return this.spline.min();
        }
        maxValue() {
            return this.spline.max();
        }
    }
    DensityFunction.Spline = Spline;
    class YClampedGradient extends DensityFunction {
        fromY;
        toY;
        fromValue;
        toValue;
        constructor(fromY, toY, fromValue, toValue) {
            super();
            this.fromY = fromY;
            this.toY = toY;
            this.fromValue = fromValue;
            this.toValue = toValue;
        }
        compute(context) {
            return clampedMap(context.y, this.fromY, this.toY, this.fromValue, this.toValue);
        }
        minValue() {
            return Math.min(this.fromValue, this.toValue);
        }
        maxValue() {
            return Math.max(this.fromValue, this.toValue);
        }
    }
    DensityFunction.YClampedGradient = YClampedGradient;
})(DensityFunction || (DensityFunction = {}));
//# sourceMappingURL=DensityFunction.js.map