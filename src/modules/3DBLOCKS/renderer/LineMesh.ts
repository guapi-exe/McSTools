import type { GLContext } from '../types';

const LINE_FLOATS = 6;
const FLOAT_BYTES = 4;

export interface LineAttributeLocations {
  position: number;
  color: number;
}

export class LineMesh {
  private buffer?: WebGLBuffer;
  private vertexCount = 0;

  constructor(private readonly gl: GLContext) {}

  upload(data: Float32Array) {
    this.buffer ??= this.gl.createBuffer() ?? undefined;
    if (!this.buffer) {
      throw new Error('3DBLOCKS failed to create line buffer');
    }
    this.vertexCount = data.length / LINE_FLOATS;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
  }

  draw(locations: LineAttributeLocations) {
    if (!this.buffer || this.vertexCount === 0) return;
    const stride = LINE_FLOATS * FLOAT_BYTES;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.enableAttribute(locations.position, 3, stride, 0);
    this.enableAttribute(locations.color, 3, stride, 3 * FLOAT_BYTES);
    this.gl.drawArrays(this.gl.LINES, 0, this.vertexCount);
  }

  dispose() {
    if (this.buffer) this.gl.deleteBuffer(this.buffer);
    this.buffer = undefined;
    this.vertexCount = 0;
  }

  private enableAttribute(location: number, size: number, stride: number, offset: number) {
    if (location < 0) return;
    this.gl.enableVertexAttribArray(location);
    this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, stride, offset);
  }
}

export const pushLine = (
  out: number[],
  from: [number, number, number],
  to: [number, number, number],
  color: [number, number, number],
) => {
  out.push(from[0], from[1], from[2], color[0], color[1], color[2]);
  out.push(to[0], to[1], to[2], color[0], color[1], color[2]);
};
