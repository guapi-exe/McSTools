import type { GLContext } from '../types';

export class ShaderProgram {
  readonly program: WebGLProgram;

  constructor(private readonly gl: GLContext, vertexSource: string, fragmentSource: string) {
    const vertexShader = this.compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) {
      throw new Error('3DBLOCKS failed to create WebGL program');
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) ?? 'unknown program link error';
      gl.deleteProgram(program);
      throw new Error(`3DBLOCKS shader link failed: ${message}`);
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    this.program = program;
  }

  use() {
    this.gl.useProgram(this.program);
  }

  attrib(name: string) {
    return this.gl.getAttribLocation(this.program, name);
  }

  uniform(name: string) {
    return this.gl.getUniformLocation(this.program, name);
  }

  dispose() {
    this.gl.deleteProgram(this.program);
  }

  private compile(type: number, source: string) {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error('3DBLOCKS failed to create shader');
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const message = this.gl.getShaderInfoLog(shader) ?? 'unknown shader compile error';
      this.gl.deleteShader(shader);
      throw new Error(`3DBLOCKS shader compile failed: ${message}`);
    }

    return shader;
  }
}
