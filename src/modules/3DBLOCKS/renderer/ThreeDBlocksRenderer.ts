import { mat4 } from 'gl-matrix';
import type { BlockWorld } from '../core/BlockWorld';
import { chunkDistance, chunkKey } from '../core/chunk';
import { PerfMonitor } from '../runtime/PerfMonitor';
import type {
  GLContext,
  RendererStats,
  ThreeDBlocksRendererOptions,
  ThreeDBlocksResources,
  Vec3,
} from '../types';
import { ChunkMeshBuilder, type ChunkBuildResult } from './ChunkMeshBuilder';
import { GpuMesh, type MeshAttributeLocations } from './GpuMesh';
import { GridRenderer } from './GridRenderer';
import { OutlineRenderer } from './OutlineRenderer';
import { SelectionHighlightRenderer } from './SelectionHighlightRenderer';
import { ShaderProgram } from './ShaderProgram';

const vertexSource = `
  attribute vec3 aPosition;
  attribute vec2 aUv;
  attribute vec4 aTexLimit;
  attribute vec3 aColor;
  attribute vec3 aNormal;

  uniform mat4 uView;
  uniform mat4 uProj;

  varying highp vec2 vUv;
  varying highp vec4 vTexLimit;
  varying highp vec3 vColor;
  varying highp float vLight;

  void main(void) {
    gl_Position = uProj * uView * vec4(aPosition, 1.0);
    vUv = aUv;
    vTexLimit = aTexLimit;
    vColor = aColor;
    vLight = aNormal.y * 0.2 + abs(aNormal.z) * 0.1 + 0.8;
  }
`;

const fragmentSource = `
  precision highp float;

  varying highp vec2 vUv;
  varying highp vec4 vTexLimit;
  varying highp vec3 vColor;
  varying highp float vLight;

  uniform sampler2D uAtlas;
  uniform highp float uPixelSize;

  void main(void) {
    vec2 uv = clamp(
      vUv,
      vTexLimit.xy + vec2(0.5, 0.5) * uPixelSize,
      vTexLimit.zw - vec2(0.5, 0.5) * uPixelSize
    );
    vec4 texColor = texture2D(uAtlas, uv);
    if (texColor.a < 0.01) discard;
    gl_FragColor = vec4(texColor.rgb * vColor * vLight, texColor.a);
  }
`;

interface ChunkRecord {
  pos: Vec3;
  solidData?: ChunkBuildResult['solid'];
  transparentData?: ChunkBuildResult['transparent'];
  solidMesh?: GpuMesh;
  transparentMesh?: GpuMesh;
  triangleCount: number;
}

type FrustumPlane = [number, number, number, number];

const isWebGL2 = (gl: GLContext): gl is WebGL2RenderingContext => (
  typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
);

export class ThreeDBlocksRenderer {
  private readonly shader: ShaderProgram;
  private readonly grid: GridRenderer;
  private readonly outline: OutlineRenderer;
  private readonly selectionHighlight: SelectionHighlightRenderer;
  private readonly builder: ChunkMeshBuilder;
  private readonly perf = new PerfMonitor();
  private readonly projMatrix = mat4.create();
  private readonly invView = mat4.create();
  private readonly viewProjMatrix = mat4.create();
  private readonly attributes: MeshAttributeLocations;
  private readonly uView: WebGLUniformLocation | null;
  private readonly uProj: WebGLUniformLocation | null;
  private readonly uPixelSize: WebGLUniformLocation | null;
  private readonly uAtlas: WebGLUniformLocation | null;
  private readonly atlasTexture: WebGLTexture;
  private readonly chunkRecords = new Map<string, ChunkRecord>();
  private readonly chunkSize: number;
  private readonly supportsUint32Indices: boolean;
  private renderDistanceChunks: number;
  private lazyUpload: boolean;
  private readonly maxPixelRatio: number;
  private totalTriangles = 0;
  private gpuChunkCount = 0;
  private projectionClientWidth = 0;
  private projectionClientHeight = 0;
  private projectionPixelRatio = 0;
  private lastFrameStats: Pick<RendererStats, 'drawCalls' | 'visibleChunks' | 'frameMs'> = {
    drawCalls: 0,
    visibleChunks: 0,
    frameMs: 0,
  };

  constructor(
    private readonly gl: GLContext,
    private world: BlockWorld,
    private readonly resources: ThreeDBlocksResources,
    options: ThreeDBlocksRendererOptions = {},
  ) {
    this.supportsUint32Indices = isWebGL2(gl) || !!gl.getExtension('OES_element_index_uint');
    const adaptiveChunkSize = ThreeDBlocksRenderer.getAdaptiveChunkSize(world);
    this.chunkSize = this.supportsUint32Indices
      ? (options.chunkSize ?? adaptiveChunkSize)
      : Math.min(options.chunkSize ?? adaptiveChunkSize, 8);
    this.renderDistanceChunks = options.renderDistanceChunks ?? Number.POSITIVE_INFINITY;
    this.lazyUpload = options.lazyUpload ?? false;
    this.maxPixelRatio = Math.max(1, options.maxPixelRatio ?? 1.5);

    this.shader = new ShaderProgram(gl, vertexSource, fragmentSource);
    this.grid = new GridRenderer(gl);
    this.outline = new OutlineRenderer(gl);
    this.selectionHighlight = new SelectionHighlightRenderer(gl);
    this.builder = new ChunkMeshBuilder(gl, world, resources, this.chunkSize, this.supportsUint32Indices);
    this.attributes = {
      position: this.shader.attrib('aPosition'),
      uv: this.shader.attrib('aUv'),
      texLimit: this.shader.attrib('aTexLimit'),
      color: this.shader.attrib('aColor'),
      normal: this.shader.attrib('aNormal'),
    };
    this.uView = this.shader.uniform('uView');
    this.uProj = this.shader.uniform('uProj');
    this.uPixelSize = this.shader.uniform('uPixelSize');
    this.uAtlas = this.shader.uniform('uAtlas');
    this.atlasTexture = this.createAtlasTexture(options.atlasMipmaps ?? false);
    this.configureGL();
    this.grid.setSize(world.getSize());
    this.updateProjection();
    if (!options.deferInitialBuild) {
      this.updateStructureBuffers();
    } else {
      this.updatePerfStats();
    }
    this.logSummary('initial-build', options.versionTag);
  }

  static getAdaptiveChunkSize(world: BlockWorld) {
    const [x, y, z] = world.getSize();
    const volume = x * y * z;
    if (volume >= 256 * 256 * 128) return 32;
    if (volume >= 128 * 128 * 96) return 24;
    return 16;
  }

  getChunkSize() {
    return this.chunkSize;
  }

  setRenderDistanceChunks(distance: number) {
    this.renderDistanceChunks = distance > 0 ? distance : Number.POSITIVE_INFINITY;
  }

  setLazyUpload(enabled: boolean) {
    this.lazyUpload = enabled;
  }

  setStructure(world: BlockWorld) {
    this.world = world;
    this.builder.setWorld(world);
    this.grid.setSize(world.getSize());
    this.updateStructureBuffers();
  }

  async setStructureAsync(world: BlockWorld, blocksPerSlice = 4000, signal?: AbortSignal) {
    this.world = world;
    this.builder.setWorld(world);
    this.grid.setSize(world.getSize());
    await this.updateStructureBuffersAsync(undefined, blocksPerSlice, signal);
  }

  async setStructureProgressiveAsync(
    world: BlockWorld,
    blocksPerSlice = 4000,
    signal?: AbortSignal,
    onProgress?: (builtChunks: number, totalChunks: number) => void,
  ) {
    this.world = world;
    this.builder.setWorld(world);
    this.grid.setSize(world.getSize());
    await this.updateStructureBuffersProgressiveAsync(undefined, blocksPerSlice, signal, onProgress);
  }

  updateStructureBuffers(chunkPositions?: Vec3[]) {
    this.perf.measure('buildMs', () => {
      this.applyBuildResults(this.builder.buildChunks(chunkPositions), chunkPositions);
    });
  }

  async updateStructureBuffersAsync(chunkPositions?: Vec3[], blocksPerSlice = 4000, signal?: AbortSignal) {
    await this.perf.measureAsync('buildMs', async () => {
      const results = await this.builder.buildChunksAsync(chunkPositions, blocksPerSlice, signal);
      if (signal?.aborted) {
        throw new DOMException('3DBLOCKS renderer update aborted', 'AbortError');
      }
      this.applyBuildResults(results, chunkPositions);
    });
  }

  async updateStructureBuffersProgressiveAsync(
    chunkPositions?: Vec3[],
    blocksPerSlice = 4000,
    signal?: AbortSignal,
    onProgress?: (builtChunks: number, totalChunks: number) => void,
  ) {
    await this.perf.measureAsync('buildMs', async () => {
      let clearedForFullBuild = !!chunkPositions;
      if (!chunkPositions) onProgress?.(0, 0);

      await this.builder.buildChunksProgressiveAsync(
        chunkPositions,
        blocksPerSlice,
        signal,
        (result, builtChunks, totalChunks) => {
          if (signal?.aborted) {
            throw new DOMException('3DBLOCKS renderer update aborted', 'AbortError');
          }
          if (!clearedForFullBuild) {
            this.clearChunkRecords();
            clearedForFullBuild = true;
          }
          this.applyBuildResults([result], [result.chunkPos]);
          onProgress?.(builtChunks, totalChunks);
        },
      );

      if (!clearedForFullBuild) {
        this.clearChunkRecords();
      }
    });
  }

  drawStructure(view: mat4) {
    const start = performance.now();
    this.updateProjection();
    const visibleRecords = this.getVisibleRecords(view);
    let drawCalls = 0;

    this.shader.use();
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.atlasTexture);
    if (this.uAtlas) this.gl.uniform1i(this.uAtlas, 0);
    if (this.uPixelSize) this.gl.uniform1f(this.uPixelSize, this.resources.getPixelSize?.() ?? 0);
    if (this.uView) this.gl.uniformMatrix4fv(this.uView, false, view);
    if (this.uProj) this.gl.uniformMatrix4fv(this.uProj, false, this.projMatrix);

    for (const record of visibleRecords) {
      if (record.solidData) {
        const hadGpuMesh = this.recordHasGpuMesh(record);
        record.solidMesh ??= new GpuMesh(this.gl, record.solidData);
        if (!hadGpuMesh && this.recordHasGpuMesh(record)) this.gpuChunkCount += 1;
        record.solidMesh.draw(this.attributes);
        drawCalls += 1;
      }
    }
    for (const record of visibleRecords) {
      if (record.transparentData) {
        const hadGpuMesh = this.recordHasGpuMesh(record);
        record.transparentMesh ??= new GpuMesh(this.gl, record.transparentData);
        if (!hadGpuMesh && this.recordHasGpuMesh(record)) this.gpuChunkCount += 1;
        record.transparentMesh.draw(this.attributes);
        drawCalls += 1;
      }
    }

    this.lastFrameStats = {
      drawCalls,
      visibleChunks: visibleRecords.length,
      frameMs: performance.now() - start,
    };
    this.updatePerfStats();
  }

  drawGrid(view: mat4) {
    this.updateProjection();
    this.grid.draw(view, this.projMatrix);
  }

  drawOutline(view: mat4, pos: Vec3, color: Vec3 = [1, 1, 1]) {
    this.updateProjection();
    this.outline.draw(view, this.projMatrix, pos, color);
  }

  setSelectionHighlightPositions(positions: Vec3[]) {
    this.selectionHighlight.setPositions(positions);
  }

  clearSelectionHighlights() {
    this.selectionHighlight.clear();
  }

  drawSelectionHighlights(view: mat4, color: Vec3 = [1.0, 0.78, 0.08]) {
    this.updateProjection();
    this.selectionHighlight.draw(view, this.projMatrix, color);
  }

  getStats() {
    this.updatePerfStats();
    return this.perf.snapshot();
  }

  dispose() {
    this.clearChunkRecords();
    this.gl.deleteTexture(this.atlasTexture);
    this.grid.dispose();
    this.outline.dispose();
    this.selectionHighlight.dispose();
    this.shader.dispose();
  }

  private applyBuildResults(results: ChunkBuildResult[], targets?: Vec3[]) {
    if (!targets) {
      this.clearChunkRecords();
    }

    for (const result of results) {
      this.applyBuildResult(result);
    }

    this.updatePerfStats();
  }

  private applyBuildResult(result: ChunkBuildResult) {
    const key = chunkKey(result.chunkPos);
    const old = this.chunkRecords.get(key);
    if (old) {
      this.totalTriangles -= old.triangleCount;
      if (this.recordHasGpuMesh(old)) this.gpuChunkCount -= 1;
      old.solidMesh?.dispose();
      old.transparentMesh?.dispose();
    }

    const record: ChunkRecord = {
      pos: result.chunkPos,
      solidData: result.solid,
      transparentData: result.transparent,
      triangleCount: result.triangleCount,
    };

    if (!this.lazyUpload) {
      if (record.solidData) record.solidMesh = new GpuMesh(this.gl, record.solidData);
      if (record.transparentData) record.transparentMesh = new GpuMesh(this.gl, record.transparentData);
    }

    if (record.solidData || record.transparentData) {
      this.chunkRecords.set(key, record);
      this.totalTriangles += record.triangleCount;
      if (this.recordHasGpuMesh(record)) this.gpuChunkCount += 1;
    } else {
      this.chunkRecords.delete(key);
    }
  }

  private clearChunkRecords() {
    for (const record of this.chunkRecords.values()) {
      record.solidMesh?.dispose();
      record.transparentMesh?.dispose();
    }
    this.chunkRecords.clear();
    this.totalTriangles = 0;
    this.gpuChunkCount = 0;
    this.updatePerfStats();
  }

  private recordHasGpuMesh(record: ChunkRecord) {
    return !!(record.solidMesh || record.transparentMesh);
  }

  private getVisibleRecords(view: mat4) {
    const useFrustumCulling = !Number.isFinite(this.renderDistanceChunks);
    const planes = useFrustumCulling
      ? (() => {
        mat4.multiply(this.viewProjMatrix, this.projMatrix, view);
        return this.extractFrustumPlanes(this.viewProjMatrix);
      })()
      : null;

    let cameraChunk: Vec3 | null = null;
    if (Number.isFinite(this.renderDistanceChunks)) {
      mat4.invert(this.invView, view);
      cameraChunk = [
        Math.floor(this.invView[12] / this.chunkSize),
        Math.floor(this.invView[13] / this.chunkSize),
        Math.floor(this.invView[14] / this.chunkSize),
      ];
    }

    const visible: ChunkRecord[] = [];
    for (const record of this.chunkRecords.values()) {
      if (cameraChunk && chunkDistance(record.pos, cameraChunk) > this.renderDistanceChunks) continue;
      if (planes && !this.isChunkInFrustum(record.pos, planes)) continue;
      visible.push(record);
    }
    return visible;
  }

  private extractFrustumPlanes(matrix: mat4): FrustumPlane[] {
    return [
      this.normalizePlane([matrix[3] + matrix[0], matrix[7] + matrix[4], matrix[11] + matrix[8], matrix[15] + matrix[12]]),
      this.normalizePlane([matrix[3] - matrix[0], matrix[7] - matrix[4], matrix[11] - matrix[8], matrix[15] - matrix[12]]),
      this.normalizePlane([matrix[3] + matrix[1], matrix[7] + matrix[5], matrix[11] + matrix[9], matrix[15] + matrix[13]]),
      this.normalizePlane([matrix[3] - matrix[1], matrix[7] - matrix[5], matrix[11] - matrix[9], matrix[15] - matrix[13]]),
      this.normalizePlane([matrix[3] + matrix[2], matrix[7] + matrix[6], matrix[11] + matrix[10], matrix[15] + matrix[14]]),
      this.normalizePlane([matrix[3] - matrix[2], matrix[7] - matrix[6], matrix[11] - matrix[10], matrix[15] - matrix[14]]),
    ];
  }

  private normalizePlane(plane: FrustumPlane): FrustumPlane {
    const length = Math.hypot(plane[0], plane[1], plane[2]) || 1;
    return [plane[0] / length, plane[1] / length, plane[2] / length, plane[3] / length];
  }

  private isChunkInFrustum(chunkPos: Vec3, planes: FrustumPlane[]) {
    const size = this.world.getSize();
    const minX = chunkPos[0] * this.chunkSize;
    const minY = chunkPos[1] * this.chunkSize;
    const minZ = chunkPos[2] * this.chunkSize;
    const maxX = Math.min(size[0], minX + this.chunkSize);
    const maxY = Math.min(size[1], minY + this.chunkSize);
    const maxZ = Math.min(size[2], minZ + this.chunkSize);

    for (const [a, b, c, d] of planes) {
      const x = a >= 0 ? maxX : minX;
      const y = b >= 0 ? maxY : minY;
      const z = c >= 0 ? maxZ : minZ;
      if (a * x + b * y + c * z + d < 0) return false;
    }
    return true;
  }

  private createAtlasTexture(mipmaps: boolean) {
    const texture = this.gl.createTexture();
    if (!texture) {
      throw new Error('3DBLOCKS failed to create atlas texture');
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.resources.getTextureAtlas(),
    );
    if (mipmaps) {
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST_MIPMAP_NEAREST);
    } else {
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    }
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    return texture;
  }

  private configureGL() {
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.cullFace(this.gl.BACK);
  }

  private updateProjection() {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    const width = canvas.clientWidth || canvas.width || 1;
    const height = canvas.clientHeight || canvas.height || 1;
    const pixelRatio = Math.min(this.maxPixelRatio, Math.max(1, window.devicePixelRatio || 1));
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    const projectionUnchanged = this.projectionClientWidth === width
      && this.projectionClientHeight === height
      && this.projectionPixelRatio === pixelRatio
      && canvas.width === targetWidth
      && canvas.height === targetHeight;

    if (projectionUnchanged) return;

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    this.projectionClientWidth = width;
    this.projectionClientHeight = height;
    this.projectionPixelRatio = pixelRatio;
    this.gl.viewport(0, 0, canvas.width, canvas.height);
    const maxSize = Math.max(...this.world.getSize());
    mat4.perspective(this.projMatrix, 70 * Math.PI / 180, width / height, 0.1, Math.max(500, maxSize * 8));
  }

  private updatePerfStats() {
    this.perf.update({
      chunkSize: this.chunkSize,
      chunkCount: this.chunkRecords.size,
      gpuChunks: this.gpuChunkCount,
      triangles: this.totalTriangles,
      drawCalls: this.lastFrameStats.drawCalls,
      visibleChunks: this.lastFrameStats.visibleChunks,
      frameMs: this.lastFrameStats.frameMs,
    });
  }

  private logSummary(stage: string, versionTag?: string) {
    const stats = this.getStats();
    const [x, y, z] = this.world.getSize();
    console.info(
      `[3DBLOCKS] ${stage} | version=${versionTag ?? 'unknown'} | size=${x}x${y}x${z}`
      + ` | chunks=${stats.chunkCount} | triangles=${stats.triangles} | buildMs=${stats.buildMs.toFixed(2)}`,
    );
  }
}
