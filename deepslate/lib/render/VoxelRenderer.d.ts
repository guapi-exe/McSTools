import type { mat4 } from 'gl-matrix';
import type { Color } from '../util/index.js';
import { Renderer } from './Renderer.js';
export interface Voxel {
    x: number;
    y: number;
    z: number;
    color: Color;
}
export declare class VoxelRenderer extends Renderer {
    private readonly voxelShaderProgram;
    private voxels;
    private quads;
    private meshes;
    constructor(gl: WebGLRenderingContext);
    setVoxels(voxels: Voxel[]): void;
    private getQuads;
    private getMeshes;
    draw(viewMatrix: mat4): void;
}
//# sourceMappingURL=VoxelRenderer.d.ts.map