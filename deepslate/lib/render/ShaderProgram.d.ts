export declare class ShaderProgram {
    private readonly gl;
    private readonly program;
    constructor(gl: WebGLRenderingContext, vsSource: string, fsSource: string);
    getProgram(): WebGLProgram;
    private initShaderProgram;
    private loadShader;
}
//# sourceMappingURL=ShaderProgram.d.ts.map