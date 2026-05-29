import { mat4 } from 'gl-matrix';
import type { GLContext, Vec3 } from '../types';
import { LineMesh, pushLine, type LineAttributeLocations } from './LineMesh';
import { ShaderProgram } from './ShaderProgram';

const vertexSource = `
  attribute vec3 aPosition;
  attribute vec3 aColor;
  uniform mat4 uView;
  uniform mat4 uProj;
  varying highp vec3 vColor;

  void main(void) {
    gl_Position = uProj * uView * vec4(aPosition, 1.0);
    vColor = aColor;
  }
`;

const fragmentSource = `
  precision highp float;
  varying highp vec3 vColor;

  void main(void) {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

export class GridRenderer {
  private readonly shader: ShaderProgram;
  private readonly mesh: LineMesh;
  private readonly locations: LineAttributeLocations;
  private readonly uView: WebGLUniformLocation | null;
  private readonly uProj: WebGLUniformLocation | null;
  private axisBuffer?: WebGLBuffer;
  private axisVertexCount = 0;
  private sizeKey = '';

  constructor(private readonly gl: GLContext) {
    this.shader = new ShaderProgram(gl, vertexSource, fragmentSource);
    this.mesh = new LineMesh(gl);
    this.locations = {
      position: this.shader.attrib('aPosition'),
      color: this.shader.attrib('aColor'),
    };
    this.uView = this.shader.uniform('uView');
    this.uProj = this.shader.uniform('uProj');
  }

  setSize(size: Vec3) {
    const key = size.join(',');
    if (this.sizeKey === key) return;
    this.sizeKey = key;

    const [xSize, ySize, zSize] = size;
    const maxHorizontal = Math.max(xSize, zSize);
    const step = Math.max(1, Math.ceil(maxHorizontal / 128));
    const data: number[] = [];
    const grey: Vec3 = [0.72, 0.72, 0.72];
    const red: Vec3 = [1, 0.15, 0.12];
    const green: Vec3 = [0.05, 0.82, 0.22];
    const blue: Vec3 = [0.15, 0.25, 1];

    pushLine(data, [0, 0, 0], [xSize, 0, 0], red);
    pushLine(data, [0, 0, 0], [0, ySize, 0], green);
    pushLine(data, [0, 0, 0], [0, 0, zSize], blue);

    for (let x = 0; x <= xSize; x += step) {
      pushLine(data, [x, 0, 0], [x, 0, zSize], grey);
    }
    for (let z = 0; z <= zSize; z += step) {
      pushLine(data, [0, 0, z], [xSize, 0, z], grey);
    }

    pushLine(data, [xSize, 0, 0], [xSize, ySize, 0], grey);
    pushLine(data, [0, 0, zSize], [0, ySize, zSize], grey);
    pushLine(data, [xSize, 0, zSize], [xSize, ySize, zSize], grey);
    pushLine(data, [0, ySize, 0], [xSize, ySize, 0], grey);
    pushLine(data, [0, ySize, zSize], [xSize, ySize, zSize], grey);
    pushLine(data, [0, ySize, 0], [0, ySize, zSize], grey);
    pushLine(data, [xSize, ySize, 0], [xSize, ySize, zSize], grey);

    this.mesh.upload(new Float32Array(data));
    this.uploadAxisGeometry(size, red, green, blue);
  }

  draw(view: mat4, proj: mat4) {
    this.shader.use();
    if (this.uView) this.gl.uniformMatrix4fv(this.uView, false, view);
    if (this.uProj) this.gl.uniformMatrix4fv(this.uProj, false, proj);
    this.mesh.draw(this.locations);
    this.drawAxes();
  }

  dispose() {
    this.mesh.dispose();
    if (this.axisBuffer) this.gl.deleteBuffer(this.axisBuffer);
    this.axisBuffer = undefined;
    this.axisVertexCount = 0;
    this.shader.dispose();
  }

  private uploadAxisGeometry(size: Vec3, xColor: Vec3, yColor: Vec3, zColor: Vec3) {
    const [xSize, ySize, zSize] = size;
    const maxSize = Math.max(1, xSize, ySize, zSize);
    const pad = Math.max(1.5, Math.min(8, maxSize * 0.05));
    const thickness = Math.max(0.08, Math.min(0.55, maxSize * 0.008));
    const arrowLength = Math.max(0.7, Math.min(4.5, maxSize * 0.055));
    const arrowRadius = thickness * 3.2;
    const labelPixel = Math.max(0.18, Math.min(0.85, maxSize * 0.012));
    const labelDepth = thickness * 1.4;
    const labelGap = arrowLength * 0.55;
    const data: number[] = [];

    this.pushAxisX(data, xSize + pad, thickness, arrowLength, arrowRadius, xColor);
    this.pushAxisY(data, ySize + pad, thickness, arrowLength, arrowRadius, yColor);
    this.pushAxisZ(data, zSize + pad, thickness, arrowLength, arrowRadius, zColor);

    this.pushVoxelLetter(data, 'X', 'yz', [xSize + pad + labelGap, labelPixel * 4.5, 0], labelPixel, labelDepth, xColor);
    this.pushVoxelLetter(data, 'Y', 'xz', [0, ySize + pad + labelGap, 0], labelPixel, labelDepth, yColor);
    this.pushVoxelLetter(data, 'Z', 'xy', [0, labelPixel * 4.5, zSize + pad + labelGap], labelPixel, labelDepth, zColor);

    this.axisBuffer ??= this.gl.createBuffer() ?? undefined;
    if (!this.axisBuffer) {
      throw new Error('3DBLOCKS failed to create axis buffer');
    }
    this.axisVertexCount = data.length / 6;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.axisBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW);
  }

  private drawAxes() {
    if (!this.axisBuffer || this.axisVertexCount === 0) return;

    const depthEnabled = this.gl.isEnabled(this.gl.DEPTH_TEST);
    const cullEnabled = this.gl.isEnabled(this.gl.CULL_FACE);
    const depthWriteEnabled = this.gl.getParameter(this.gl.DEPTH_WRITEMASK) as boolean;

    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.depthMask(false);

    const stride = 6 * 4;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.axisBuffer);
    this.enableAttribute(this.locations.position, 3, stride, 0);
    this.enableAttribute(this.locations.color, 3, stride, 3 * 4);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.axisVertexCount);

    this.gl.depthMask(depthWriteEnabled);
    if (depthEnabled) this.gl.enable(this.gl.DEPTH_TEST);
    else this.gl.disable(this.gl.DEPTH_TEST);
    if (cullEnabled) this.gl.enable(this.gl.CULL_FACE);
    else this.gl.disable(this.gl.CULL_FACE);
  }

  private enableAttribute(location: number, size: number, stride: number, offset: number) {
    if (location < 0) return;
    this.gl.enableVertexAttribArray(location);
    this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, stride, offset);
  }

  private pushAxisX(data: number[], length: number, thickness: number, arrowLength: number, arrowRadius: number, color: Vec3) {
    const bodyEnd = Math.max(0.1, length - arrowLength);
    this.pushBox(data, 0, bodyEnd, -thickness, thickness, -thickness, thickness, color);
    this.pushPyramidX(data, bodyEnd, length, arrowRadius, color);
  }

  private pushAxisY(data: number[], length: number, thickness: number, arrowLength: number, arrowRadius: number, color: Vec3) {
    const bodyEnd = Math.max(0.1, length - arrowLength);
    this.pushBox(data, -thickness, thickness, 0, bodyEnd, -thickness, thickness, color);
    this.pushPyramidY(data, bodyEnd, length, arrowRadius, color);
  }

  private pushAxisZ(data: number[], length: number, thickness: number, arrowLength: number, arrowRadius: number, color: Vec3) {
    const bodyEnd = Math.max(0.1, length - arrowLength);
    this.pushBox(data, -thickness, thickness, -thickness, thickness, 0, bodyEnd, color);
    this.pushPyramidZ(data, bodyEnd, length, arrowRadius, color);
  }

  private pushPyramidX(data: number[], baseX: number, tipX: number, radius: number, color: Vec3) {
    const tip: Vec3 = [tipX, 0, 0];
    const a: Vec3 = [baseX, -radius, -radius];
    const b: Vec3 = [baseX, radius, -radius];
    const c: Vec3 = [baseX, radius, radius];
    const d: Vec3 = [baseX, -radius, radius];
    this.pushTriangle(data, tip, a, b, color);
    this.pushTriangle(data, tip, b, c, color);
    this.pushTriangle(data, tip, c, d, color);
    this.pushTriangle(data, tip, d, a, color);
    this.pushQuad(data, a, d, c, b, color);
  }

  private pushPyramidY(data: number[], baseY: number, tipY: number, radius: number, color: Vec3) {
    const tip: Vec3 = [0, tipY, 0];
    const a: Vec3 = [-radius, baseY, -radius];
    const b: Vec3 = [radius, baseY, -radius];
    const c: Vec3 = [radius, baseY, radius];
    const d: Vec3 = [-radius, baseY, radius];
    this.pushTriangle(data, tip, b, a, color);
    this.pushTriangle(data, tip, c, b, color);
    this.pushTriangle(data, tip, d, c, color);
    this.pushTriangle(data, tip, a, d, color);
    this.pushQuad(data, a, b, c, d, color);
  }

  private pushPyramidZ(data: number[], baseZ: number, tipZ: number, radius: number, color: Vec3) {
    const tip: Vec3 = [0, 0, tipZ];
    const a: Vec3 = [-radius, -radius, baseZ];
    const b: Vec3 = [radius, -radius, baseZ];
    const c: Vec3 = [radius, radius, baseZ];
    const d: Vec3 = [-radius, radius, baseZ];
    this.pushTriangle(data, tip, a, b, color);
    this.pushTriangle(data, tip, b, c, color);
    this.pushTriangle(data, tip, c, d, color);
    this.pushTriangle(data, tip, d, a, color);
    this.pushQuad(data, a, d, c, b, color);
  }

  private pushVoxelLetter(
    data: number[],
    letter: 'X' | 'Y' | 'Z',
    plane: 'xy' | 'xz' | 'yz',
    center: Vec3,
    pixel: number,
    depth: number,
    color: Vec3,
  ) {
    const masks: Record<'X' | 'Y' | 'Z', string[]> = {
      X: ['10001', '01010', '00100', '01010', '10001'],
      Y: ['10001', '01010', '00100', '00100', '00100'],
      Z: ['11111', '00010', '00100', '01000', '11111'],
    };
    const mask = masks[letter];
    const gap = pixel * 0.16;
    const cell = pixel;
    const pitch = cell + gap;
    const half = (mask.length * pitch - gap) / 2;

    for (let row = 0; row < mask.length; row += 1) {
      for (let col = 0; col < mask[row].length; col += 1) {
        if (mask[row][col] !== '1') continue;
        const u = col * pitch - half;
        const v = half - row * pitch;
        this.pushLetterPixel(data, plane, center, u, v, cell, depth, color);
      }
    }
  }

  private pushLetterPixel(
    data: number[],
    plane: 'xy' | 'xz' | 'yz',
    center: Vec3,
    u: number,
    v: number,
    size: number,
    depth: number,
    color: Vec3,
  ) {
    const half = size / 2;
    const d = depth / 2;
    if (plane === 'xy') {
      this.pushBox(data, center[0] + u - half, center[0] + u + half, center[1] + v - half, center[1] + v + half, center[2] - d, center[2] + d, color);
      return;
    }
    if (plane === 'xz') {
      this.pushBox(data, center[0] + u - half, center[0] + u + half, center[1] - d, center[1] + d, center[2] + v - half, center[2] + v + half, color);
      return;
    }
    this.pushBox(data, center[0] - d, center[0] + d, center[1] + v - half, center[1] + v + half, center[2] + u - half, center[2] + u + half, color);
  }

  private pushBox(
    data: number[],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    color: Vec3,
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

    this.pushQuad(data, p.lbf, p.rbf, p.rtf, p.ltf, color);
    this.pushQuad(data, p.rbb, p.lbb, p.ltb, p.rtb, color);
    this.pushQuad(data, p.lbb, p.lbf, p.ltf, p.ltb, color);
    this.pushQuad(data, p.rbf, p.rbb, p.rtb, p.rtf, color);
    this.pushQuad(data, p.ltf, p.rtf, p.rtb, p.ltb, color);
    this.pushQuad(data, p.lbb, p.rbb, p.rbf, p.lbf, color);
  }

  private pushQuad(data: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3) {
    this.pushTriangle(data, a, b, c, color);
    this.pushTriangle(data, a, c, d, color);
  }

  private pushTriangle(data: number[], a: Vec3, b: Vec3, c: Vec3, color: Vec3) {
    this.pushVertex(data, a, color);
    this.pushVertex(data, b, color);
    this.pushVertex(data, c, color);
  }

  private pushVertex(data: number[], pos: Vec3, color: Vec3) {
    data.push(pos[0], pos[1], pos[2], color[0], color[1], color[2]);
  }
}
