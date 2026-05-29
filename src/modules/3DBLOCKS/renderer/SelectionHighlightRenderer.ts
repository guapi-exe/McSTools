import { mat4 } from 'gl-matrix';
import type { GLContext, Vec3 } from '../types';
import { ShaderProgram } from './ShaderProgram';

const vertexSource = `
  attribute vec3 aPosition;
  attribute vec3 aOffset;

  uniform mat4 uView;
  uniform mat4 uProj;

  void main(void) {
    gl_Position = uProj * uView * vec4(aPosition + aOffset, 1.0);
  }
`;

const fragmentSource = `
  precision highp float;

  uniform highp vec3 uColor;
  uniform highp float uAlpha;

  void main(void) {
    gl_FragColor = vec4(uColor, uAlpha);
  }
`;

const FLOAT_BYTES = 4;

type InstancedExt = ANGLE_instanced_arrays | null;

const isWebGL2 = (gl: GLContext): gl is WebGL2RenderingContext => (
  typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
);

export class SelectionHighlightRenderer {
  private readonly shader: ShaderProgram;
  private readonly baseBuffer: WebGLBuffer;
  private readonly offsetBuffer: WebGLBuffer;
  private readonly positionLocation: number;
  private readonly offsetLocation: number;
  private readonly uView: WebGLUniformLocation | null;
  private readonly uProj: WebGLUniformLocation | null;
  private readonly uColor: WebGLUniformLocation | null;
  private readonly uAlpha: WebGLUniformLocation | null;
  private readonly instancedExt: InstancedExt;
  private readonly baseVertexCount: number;
  private instanceCount = 0;

  constructor(private readonly gl: GLContext) {
    this.shader = new ShaderProgram(gl, vertexSource, fragmentSource);
    this.positionLocation = this.shader.attrib('aPosition');
    this.offsetLocation = this.shader.attrib('aOffset');
    this.uView = this.shader.uniform('uView');
    this.uProj = this.shader.uniform('uProj');
    this.uColor = this.shader.uniform('uColor');
    this.uAlpha = this.shader.uniform('uAlpha');
    this.instancedExt = isWebGL2(gl) ? null : gl.getExtension('ANGLE_instanced_arrays');

    const baseBuffer = gl.createBuffer();
    const offsetBuffer = gl.createBuffer();
    if (!baseBuffer || !offsetBuffer) {
      throw new Error('3DBLOCKS failed to create selection highlight buffers');
    }
    this.baseBuffer = baseBuffer;
    this.offsetBuffer = offsetBuffer;

    const baseVertices = new Float32Array(this.createCubeShellVertices());
    this.baseVertexCount = baseVertices.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.baseBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, baseVertices, gl.STATIC_DRAW);
  }

  setPositions(positions: Vec3[]) {
    this.instanceCount = positions.length;
    const data = new Float32Array(positions.length * 3);
    for (let index = 0; index < positions.length; index += 1) {
      const offset = index * 3;
      data[offset] = positions[index][0];
      data[offset + 1] = positions[index][1];
      data[offset + 2] = positions[index][2];
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.offsetBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.DYNAMIC_DRAW);
  }

  clear() {
    this.instanceCount = 0;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.offsetBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, 0, this.gl.DYNAMIC_DRAW);
  }

  draw(view: mat4, proj: mat4, color: Vec3 = [1.0, 0.78, 0.08], alpha = 0.34) {
    if (this.instanceCount === 0 || this.positionLocation < 0 || this.offsetLocation < 0) return;
    if (!isWebGL2(this.gl) && !this.instancedExt) return;

    this.shader.use();
    if (this.uView) this.gl.uniformMatrix4fv(this.uView, false, view);
    if (this.uProj) this.gl.uniformMatrix4fv(this.uProj, false, proj);
    if (this.uColor) this.gl.uniform3fv(this.uColor, color);
    if (this.uAlpha) this.gl.uniform1f(this.uAlpha, alpha);

    const depthEnabled = this.gl.isEnabled(this.gl.DEPTH_TEST);
    const cullEnabled = this.gl.isEnabled(this.gl.CULL_FACE);
    const blendEnabled = this.gl.isEnabled(this.gl.BLEND);
    const depthWriteEnabled = this.gl.getParameter(this.gl.DEPTH_WRITEMASK) as boolean;

    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.enable(this.gl.BLEND);
    this.gl.depthMask(false);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.baseBuffer);
    this.gl.enableVertexAttribArray(this.positionLocation);
    this.gl.vertexAttribPointer(this.positionLocation, 3, this.gl.FLOAT, false, 3 * FLOAT_BYTES, 0);
    this.setDivisor(this.positionLocation, 0);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.offsetBuffer);
    this.gl.enableVertexAttribArray(this.offsetLocation);
    this.gl.vertexAttribPointer(this.offsetLocation, 3, this.gl.FLOAT, false, 3 * FLOAT_BYTES, 0);
    this.setDivisor(this.offsetLocation, 1);

    this.drawInstanced();
    this.setDivisor(this.offsetLocation, 0);

    this.gl.depthMask(depthWriteEnabled);
    if (depthEnabled) this.gl.enable(this.gl.DEPTH_TEST);
    else this.gl.disable(this.gl.DEPTH_TEST);
    if (cullEnabled) this.gl.enable(this.gl.CULL_FACE);
    else this.gl.disable(this.gl.CULL_FACE);
    if (!blendEnabled) this.gl.disable(this.gl.BLEND);
  }

  dispose() {
    this.gl.deleteBuffer(this.baseBuffer);
    this.gl.deleteBuffer(this.offsetBuffer);
    this.shader.dispose();
  }

  private setDivisor(location: number, divisor: number) {
    if (isWebGL2(this.gl)) {
      this.gl.vertexAttribDivisor(location, divisor);
    } else {
      this.instancedExt?.vertexAttribDivisorANGLE(location, divisor);
    }
  }

  private drawInstanced() {
    if (isWebGL2(this.gl)) {
      this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, this.baseVertexCount, this.instanceCount);
    } else {
      this.instancedExt?.drawArraysInstancedANGLE(this.gl.TRIANGLES, 0, this.baseVertexCount, this.instanceCount);
    }
  }

  private createCubeShellVertices() {
    const min = -0.028;
    const max = 1.028;
    const data: number[] = [];
    this.pushBox(data, min, max, min, max, min, max);
    return data;
  }

  private pushBox(
    data: number[],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
  ) {
    const p = {
      lbf: [minX, minY, minZ] as Vec3,
      rbf: [maxX, minY, minZ] as Vec3,
      ltf: [minX, maxY, minZ] as Vec3,
      rtf: [maxX, maxY, minZ] as Vec3,
      lbb: [minX, minY, maxZ] as Vec3,
      rbb: [maxX, minY, maxZ] as Vec3,
      ltb: [minX, maxY, maxZ] as Vec3,
      rtb: [maxX, maxY, maxZ] as Vec3,
    };

    this.pushQuad(data, p.lbf, p.rbf, p.rtf, p.ltf);
    this.pushQuad(data, p.rbb, p.lbb, p.ltb, p.rtb);
    this.pushQuad(data, p.lbb, p.lbf, p.ltf, p.ltb);
    this.pushQuad(data, p.rbf, p.rbb, p.rtb, p.rtf);
    this.pushQuad(data, p.ltf, p.rtf, p.rtb, p.ltb);
    this.pushQuad(data, p.lbb, p.rbb, p.rbf, p.lbf);
  }

  private pushQuad(data: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
    this.pushTriangle(data, a, b, c);
    this.pushTriangle(data, a, c, d);
  }

  private pushTriangle(data: number[], a: Vec3, b: Vec3, c: Vec3) {
    this.pushVertex(data, a);
    this.pushVertex(data, b);
    this.pushVertex(data, c);
  }

  private pushVertex(data: number[], pos: Vec3) {
    data.push(pos[0], pos[1], pos[2]);
  }
}
