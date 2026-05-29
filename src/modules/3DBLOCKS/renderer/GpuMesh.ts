import type { GLContext } from '../types';

export const VERTEX_FLOATS = 15;
const FLOAT_BYTES = 4;

export interface MeshAttributeLocations {
  position: number;
  uv: number;
  texLimit: number;
  color: number;
  normal: number;
}

export interface ChunkMeshData {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  indexType: number;
  triangleCount: number;
}

export interface MeshDraft {
  vertices: number[];
  indices: number[];
}

export const createMeshDraft = (): MeshDraft => ({
  vertices: [],
  indices: [],
});

export class GpuMesh {
  private vertexBuffer?: WebGLBuffer;
  private indexBuffer?: WebGLBuffer;
  private indexCount = 0;
  private indexType = 0;
  triangleCount = 0;

  constructor(private readonly gl: GLContext, data: ChunkMeshData) {
    this.upload(data);
  }

  upload(data: ChunkMeshData) {
    const gl = this.gl;
    this.vertexBuffer ??= gl.createBuffer() ?? undefined;
    this.indexBuffer ??= gl.createBuffer() ?? undefined;
    if (!this.vertexBuffer || !this.indexBuffer) {
      throw new Error('3DBLOCKS failed to create mesh buffers');
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

    this.indexCount = data.indices.length;
    this.indexType = data.indexType;
    this.triangleCount = data.triangleCount;
  }

  draw(locations: MeshAttributeLocations) {
    if (!this.vertexBuffer || !this.indexBuffer || this.indexCount === 0) return;

    const gl = this.gl;
    const stride = VERTEX_FLOATS * FLOAT_BYTES;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    this.enableAttribute(locations.position, 3, stride, 0);
    this.enableAttribute(locations.uv, 2, stride, 3 * FLOAT_BYTES);
    this.enableAttribute(locations.texLimit, 4, stride, 5 * FLOAT_BYTES);
    this.enableAttribute(locations.color, 3, stride, 9 * FLOAT_BYTES);
    this.enableAttribute(locations.normal, 3, stride, 12 * FLOAT_BYTES);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
  }

  dispose() {
    if (this.vertexBuffer) this.gl.deleteBuffer(this.vertexBuffer);
    if (this.indexBuffer) this.gl.deleteBuffer(this.indexBuffer);
    this.vertexBuffer = undefined;
    this.indexBuffer = undefined;
    this.indexCount = 0;
  }

  private enableAttribute(location: number, size: number, stride: number, offset: number) {
    if (location < 0) return;
    this.gl.enableVertexAttribArray(location);
    this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, stride, offset);
  }
}
