import type { mat4 } from 'gl-matrix';
import type {
  BlockDefinition,
  BlockModel,
  Identifier,
  Resources,
} from 'deepslate';

export type Vec3 = [number, number, number];
export type BlockProperties = Record<string, string>;
export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

export interface ThreeDBlocksResources extends Resources {
  getBlockDefinition(id: Identifier): BlockDefinition | null;
  getBlockModel(id: Identifier): BlockModel | null;
}

export interface ThreeDBlocksRendererOptions {
  atlasMipmaps?: boolean;
  chunkSize?: number;
  deferInitialBuild?: boolean;
  lazyUpload?: boolean;
  maxPixelRatio?: number;
  renderDistanceChunks?: number;
  versionTag?: string;
}

export interface RenderableBlock {
  pos: Vec3;
  id: string;
  properties: BlockProperties;
  nbt?: unknown;
}

export interface RendererStats {
  chunkSize: number;
  chunkCount: number;
  visibleChunks: number;
  gpuChunks: number;
  triangles: number;
  drawCalls: number;
  buildMs: number;
  frameMs: number;
}

export interface StructureLike {
  getSize(): Vec3;
  forEachBlock(callback: (block: unknown) => void): void;
  forEachBlockAsync?(callback: (block: unknown) => Promise<void>): Promise<void>;
  getBlockState?(pos: Vec3): unknown;
}

export interface CameraView {
  view: mat4;
  cameraPosition: Vec3;
}
