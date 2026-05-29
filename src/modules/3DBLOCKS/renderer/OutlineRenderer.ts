import { mat4 } from 'gl-matrix';
import type { GLContext, Vec3 } from '../types';
import { ShaderProgram } from './ShaderProgram';

const vertexSource = `
  attribute vec3 aPosition;

  uniform mat4 uView;
  uniform mat4 uProj;
  uniform highp float uTime;

  varying highp vec3 vColor;

  highp vec3 rainbow(highp float t) {
    return 0.55 + 0.45 * cos(6.2831853 * (vec3(0.00, 0.33, 0.67) + t));
  }

  void main(void) {
    gl_Position = uProj * uView * vec4(aPosition, 1.0);
    highp float phase = dot(aPosition, vec3(0.19, 0.37, 0.53)) + uTime;
    vColor = rainbow(phase);
  }
`;

const fragmentSource = `
  precision highp float;
  varying highp vec3 vColor;

  void main(void) {
    gl_FragColor = vec4(vColor, 0.94);
  }
`;

const FLOAT_BYTES = 4;

export class OutlineRenderer {
  private readonly shader: ShaderProgram;
  private readonly translated = mat4.create();
  private readonly positionLocation: number;
  private readonly uView: WebGLUniformLocation | null;
  private readonly uProj: WebGLUniformLocation | null;
  private readonly uTime: WebGLUniformLocation | null;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly vertexCount: number;

  constructor(private readonly gl: GLContext) {
    this.shader = new ShaderProgram(gl, vertexSource, fragmentSource);
    this.positionLocation = this.shader.attrib('aPosition');
    this.uView = this.shader.uniform('uView');
    this.uProj = this.shader.uniform('uProj');
    this.uTime = this.shader.uniform('uTime');

    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error('3DBLOCKS failed to create highlight buffer');
    }
    this.vertexBuffer = buffer;

    const vertices = new Float32Array(this.createThickBoxEdges());
    this.vertexCount = vertices.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  draw(view: mat4, proj: mat4, pos: Vec3, _color?: Vec3) {
    this.shader.use();
    mat4.copy(this.translated, view);
    mat4.translate(this.translated, this.translated, pos);
    if (this.uView) this.gl.uniformMatrix4fv(this.uView, false, this.translated);
    if (this.uProj) this.gl.uniformMatrix4fv(this.uProj, false, proj);
    if (this.uTime) this.gl.uniform1f(this.uTime, performance.now() * 0.00035);

    const depthEnabled = this.gl.isEnabled(this.gl.DEPTH_TEST);
    const cullEnabled = this.gl.isEnabled(this.gl.CULL_FACE);
    const blendEnabled = this.gl.isEnabled(this.gl.BLEND);
    const depthWriteEnabled = this.gl.getParameter(this.gl.DEPTH_WRITEMASK) as boolean;

    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.enable(this.gl.BLEND);
    this.gl.depthMask(false);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    if (this.positionLocation >= 0) {
      this.gl.enableVertexAttribArray(this.positionLocation);
      this.gl.vertexAttribPointer(this.positionLocation, 3, this.gl.FLOAT, false, 3 * FLOAT_BYTES, 0);
    }
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertexCount);

    this.gl.depthMask(depthWriteEnabled);
    if (depthEnabled) this.gl.enable(this.gl.DEPTH_TEST);
    else this.gl.disable(this.gl.DEPTH_TEST);
    if (cullEnabled) this.gl.enable(this.gl.CULL_FACE);
    else this.gl.disable(this.gl.CULL_FACE);
    if (!blendEnabled) this.gl.disable(this.gl.BLEND);
  }

  dispose() {
    this.gl.deleteBuffer(this.vertexBuffer);
    this.shader.dispose();
  }

  private createThickBoxEdges() {
    const data: number[] = [];
    const min = -0.035;
    const max = 1.035;
    const thickness = 0.055;

    for (const y of [min, max]) {
      for (const z of [min, max]) {
        this.pushBox(data, min, max, y - thickness, y + thickness, z - thickness, z + thickness);
      }
    }
    for (const x of [min, max]) {
      for (const z of [min, max]) {
        this.pushBox(data, x - thickness, x + thickness, min, max, z - thickness, z + thickness);
      }
    }
    for (const x of [min, max]) {
      for (const y of [min, max]) {
        this.pushBox(data, x - thickness, x + thickness, y - thickness, y + thickness, min, max);
      }
    }

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
    this.pushVertex(data, a);
    this.pushVertex(data, b);
    this.pushVertex(data, c);
    this.pushVertex(data, a);
    this.pushVertex(data, c);
    this.pushVertex(data, d);
  }

  private pushVertex(data: number[], pos: Vec3) {
    data.push(pos[0], pos[1], pos[2]);
  }
}
