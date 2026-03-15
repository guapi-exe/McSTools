import { DensityFunction } from '../DensityFunction.js';
import type { NoiseRouter } from '../NoiseRouter.js';
export declare namespace Climate {
    export function target(temperature: number, humidity: number, continentalness: number, erosion: number, depth: number, weirdness: number): TargetPoint;
    export function parameters(temperature: number | Param, humidity: number | Param, continentalness: number | Param, erosion: number | Param, depth: number | Param, weirdness: number | Param, offset: number): ParamPoint;
    export function param(value: number | Param, max?: number): Param;
    export class Param {
        readonly min: number;
        readonly max: number;
        constructor(min: number, max: number);
        distance(param: Param | number): number;
        union(param: Param): Param;
        static fromJson(obj: unknown): Param;
    }
    export class ParamPoint {
        readonly temperature: Param;
        readonly humidity: Param;
        readonly continentalness: Param;
        readonly erosion: Param;
        readonly depth: Param;
        readonly weirdness: Param;
        readonly offset: number;
        constructor(temperature: Param, humidity: Param, continentalness: Param, erosion: Param, depth: Param, weirdness: Param, offset: number);
        fittness(point: ParamPoint | TargetPoint): number;
        space(): Param[];
        static fromJson(obj: unknown): ParamPoint;
    }
    export class TargetPoint {
        readonly temperature: number;
        readonly humidity: number;
        readonly continentalness: number;
        readonly erosion: number;
        readonly depth: number;
        readonly weirdness: number;
        constructor(temperature: number, humidity: number, continentalness: number, erosion: number, depth: number, weirdness: number);
        get offset(): number;
        toArray(): number[];
    }
    export class Parameters<T> {
        readonly things: [ParamPoint, () => T][];
        private readonly index;
        constructor(things: [ParamPoint, () => T][]);
        find(target: TargetPoint): T;
    }
    export class Sampler {
        readonly temperature: DensityFunction;
        readonly humidity: DensityFunction;
        readonly continentalness: DensityFunction;
        readonly erosion: DensityFunction;
        readonly depth: DensityFunction;
        readonly weirdness: DensityFunction;
        constructor(temperature: DensityFunction, humidity: DensityFunction, continentalness: DensityFunction, erosion: DensityFunction, depth: DensityFunction, weirdness: DensityFunction);
        static fromRouter(router: NoiseRouter): Sampler;
        sample(x: number, y: number, z: number): TargetPoint;
    }
    type DistanceMetric<T> = (node: RNode<T>, values: number[]) => number;
    export class RTree<T> {
        static readonly CHILDREN_PER_NODE = 10;
        private readonly root;
        private last_leaf;
        constructor(points: [ParamPoint, () => T][]);
        private static build;
        private static sort;
        private static bucketize;
        private static area;
        search(target: TargetPoint, distance: DistanceMetric<T>): T;
    }
    export abstract class RNode<T> {
        readonly space: Param[];
        constructor(space: Param[]);
        abstract search(values: number[], closest_leaf: RLeaf<T> | null, distance: DistanceMetric<T>): RLeaf<T>;
        distance(values: number[]): number;
    }
    export class RSubTree<T> extends RNode<T> {
        readonly children: RNode<T>[];
        constructor(children: RNode<T>[]);
        private static buildSpace;
        search(values: number[], closest_leaf: RLeaf<T> | null, distance: DistanceMetric<T>): RLeaf<T>;
    }
    export class RLeaf<T> extends RNode<T> {
        readonly thing: () => T;
        constructor(point: ParamPoint, thing: () => T);
        search(): this;
    }
    export {};
}
//# sourceMappingURL=Climate.d.ts.map