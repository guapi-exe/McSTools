import { mat4 } from 'gl-matrix';
import type { Mesh } from './Mesh.js';
export declare class Renderer {
    protected readonly gl: WebGLRenderingContext;
    protected readonly shaderProgram: WebGLProgram;
    protected projMatrix: mat4;
    private activeShader;
    private boundShader;
    private pixelSize;
    private readonly uniformLocations;
    private readonly attributeLocations;
    private readonly enabledAttributes;
    private readonly attributeBindingState;
    private currentArrayBuffer;
    private currentElementArrayBuffer;
    constructor(gl: WebGLRenderingContext);
    setViewport(x: number, y: number, width: number, height: number): void;
    protected getPerspective(): mat4;
    protected initialize(): void;
    protected setShader(shader: WebGLProgram): void;
    private getUniformLocation;
    private getAttributeLocation;
    protected setVertexAttr(name: string, size: number, buffer: WebGLBuffer | null | undefined): void;
    protected setUniform(name: string, value: Float32List): void;
    protected setTexture(texture: WebGLTexture, pixelSize?: number): void;
    protected createAtlasTexture(image: ImageData, options?: {
        mipmaps?: boolean;
    }): WebGLTexture;
    protected prepareDraw(viewMatrix: mat4): void;
    protected drawMesh(mesh: Mesh, options: {
        pos?: boolean;
        color?: boolean;
        texture?: boolean;
        normal?: boolean;
        blockPos?: boolean;
    }): void;
}
//# sourceMappingURL=Renderer.d.ts.map