import type { mat4 } from 'gl-matrix';
import { Vector } from '../math/index.js';
import type { Color } from '../util/index.js';
export declare class Vertex {
    pos: Vector;
    color: Color;
    texture: [number, number] | undefined;
    textureLimit: [number, number, number, number] | undefined;
    normal: Vector | undefined;
    blockPos: Vector | undefined;
    private static readonly VEC;
    constructor(pos: Vector, color: Color, texture: [number, number] | undefined, textureLimit: [number, number, number, number] | undefined, normal: Vector | undefined, blockPos: Vector | undefined);
    transform(transformation: mat4): this;
    translate(x: number, y: number, z: number): this;
    static fromPos(pos: Vector): Vertex;
}
//# sourceMappingURL=Vertex.d.ts.map