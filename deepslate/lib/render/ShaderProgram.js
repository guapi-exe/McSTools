export class ShaderProgram {
    gl;
    program;
    constructor(gl, vsSource, fsSource) {
        this.gl = gl;
        this.program = this.initShaderProgram(vsSource, fsSource);
    }
    getProgram() {
        return this.program;
    }
    initShaderProgram(vsSource, fsSource) {
        const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);
        const shaderProgram = this.gl.createProgram();
        this.gl.attachShader(shaderProgram, vertexShader);
        this.gl.attachShader(shaderProgram, fragmentShader);
        this.gl.linkProgram(shaderProgram);
        if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
            throw new Error(`Unable to link shader program: ${this.gl.getProgramInfoLog(shaderProgram)}`);
        }
        return shaderProgram;
    }
    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const error = new Error(`Compiling ${type === this.gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader: ${this.gl.getShaderInfoLog(shader)}`);
            this.gl.deleteShader(shader);
            throw error;
        }
        return shader;
    }
}
//# sourceMappingURL=ShaderProgram.js.map