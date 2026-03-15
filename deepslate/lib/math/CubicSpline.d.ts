export interface NumberFunction<C> {
    compute(c: C): number;
}
export interface MinMaxNumberFunction<C> extends NumberFunction<C> {
    minValue(): number;
    maxValue(): number;
}
export declare namespace MinMaxNumberFunction {
    function is(obj: unknown): obj is MinMaxNumberFunction<unknown>;
}
export interface CubicSpline<C> extends NumberFunction<C> {
    min(): number;
    max(): number;
    mapAll(visitor: CubicSpline.CoordinateVisitor<C>): CubicSpline<C>;
    calculateMinMax(): void;
}
export declare namespace CubicSpline {
    type CoordinateVisitor<C> = (f: NumberFunction<C>) => NumberFunction<C>;
    function fromJson<C>(obj: unknown, extractor: (obj: unknown) => NumberFunction<C>): Constant | MultiPoint<C>;
    class Constant implements CubicSpline<unknown> {
        private readonly value;
        constructor(value: number);
        compute(): number;
        min(): number;
        max(): number;
        mapAll(): this;
        calculateMinMax(): void;
    }
    class MultiPoint<C> implements CubicSpline<C> {
        coordinate: NumberFunction<C>;
        locations: number[];
        values: CubicSpline<C>[];
        derivatives: number[];
        private calculatedMin;
        private calculatedMax;
        constructor(coordinate: NumberFunction<C>, locations?: number[], values?: CubicSpline<C>[], derivatives?: number[]);
        compute(c: C): number;
        min(): number;
        max(): number;
        mapAll(visitor: CubicSpline.CoordinateVisitor<C>): CubicSpline<C>;
        addPoint(location: number, value: number | CubicSpline<C>, derivative?: number): this;
        calculateMinMax(): void;
        private static linearExtend;
    }
}
//# sourceMappingURL=CubicSpline.d.ts.map