import type { mat4 } from 'gl-matrix';
import type { Color } from '../index.js';
import { Vector } from '../index.js';
import { Line } from './Line.js';
import { Quad } from './Quad.js';
export declare class Mesh {
    quads: Quad[];
    lines: Line[];
    posBuffer: WebGLBuffer | undefined;
    colorBuffer: WebGLBuffer | undefined;
    textureBuffer: WebGLBuffer | undefined;
    textureLimitBuffer: WebGLBuffer | undefined;
    normalBuffer: WebGLBuffer | undefined;
    blockPosBuffer: WebGLBuffer | undefined;
    indexBuffer: WebGLBuffer | undefined;
    linePosBuffer: WebGLBuffer | undefined;
    lineColorBuffer: WebGLBuffer | undefined;
    constructor(quads?: Quad[], lines?: Line[]);
    clear(): this;
    isEmpty(): boolean;
    quadVertices(): number;
    quadIndices(): number;
    lineVertices(): number;
    merge(other: Mesh): this;
    addLine(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: Color): this;
    addLineCube(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: Color): this;
    transform(transformation: mat4): this;
    mergeTranslated(other: Mesh, x: number, y: number, z: number, blockPos?: Vector): this;
    translate(x: number, y: number, z: number): this;
    computeNormals(): void;
    rebuild(gl: WebGLRenderingContext, options: {
        pos?: boolean;
        color?: boolean;
        texture?: boolean;
        normal?: boolean;
        blockPos?: boolean;
    }): this;
}
//# sourceMappingURL=Mesh.d.ts.map