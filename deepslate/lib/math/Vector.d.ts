export declare class Vector {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    constructor(x: number, y: number, z: number);
    length(): number;
    lengthSquared(): number;
    distance(other: Vector): number;
    distanceSquared(other: Vector): number;
    abs(): Vector;
    add(other: Vector): Vector;
    sub(other: Vector): Vector;
    mul(other: Vector): Vector;
    div(other: Vector): Vector;
    scale(n: number): Vector;
    dot(other: Vector): number;
    cross(other: Vector): Vector;
    normalize(): Vector;
    components(): [number, number, number];
    toString(): string;
}
//# sourceMappingURL=Vector.d.ts.map