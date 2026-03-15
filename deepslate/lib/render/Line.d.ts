import type { mat4 } from 'gl-matrix';
import type { Vector } from '../math/index.js';
import type { Color } from '../util/index.js';
import { Vertex } from './Vertex.js';
export declare class Line {
    v1: Vertex;
    v2: Vertex;
    constructor(v1: Vertex, v2: Vertex);
    vertices(): Vertex[];
    forEach(fn: (v: Vertex) => void): this;
    transform(transformation: mat4): this;
    translate(x: number, y: number, z: number): this;
    setColor(color: Color): this;
    toString(): string;
    static fromPoints(p1: Vector, p2: Vector): Line;
}
//# sourceMappingURL=Line.d.ts.map