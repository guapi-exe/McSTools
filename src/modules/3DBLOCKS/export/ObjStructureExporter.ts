import { join } from '@tauri-apps/api/path';
import { create as createFile, mkdir, writeFile, type FileHandle } from '@tauri-apps/plugin-fs';
import type { BlockWorld } from '../core/BlockWorld';
import { ChunkMeshBuilder, type ChunkBuildResult } from '../renderer/ChunkMeshBuilder';
import { VERTEX_FLOATS, type ChunkMeshData } from '../renderer/GpuMesh';
import { ThreeDBlocksRenderer } from '../renderer/ThreeDBlocksRenderer';
import type { GLContext, ThreeDBlocksResources } from '../types';

export type ObjStructureExportStage = 'prepare' | 'geometry' | 'material' | 'texture' | 'done';

export interface ObjStructureExportProgress {
  stage: ObjStructureExportStage;
  builtChunks: number;
  totalChunks: number;
  triangleCount: number;
  bytesWritten: number;
  percent: number;
}

export interface ObjStructurePackageResult {
  outputDirectory: string;
  objPath: string;
  mtlPath: string;
  texturePath: string;
  triangleCount: number;
  bytesWritten: number;
  chunkCount: number;
}

export interface ObjStructurePackageOptions {
  world: BlockWorld;
  resources: ThreeDBlocksResources;
  gl: GLContext;
  name: string;
  targetDirectory: string;
  chunkSize?: number;
  blocksPerSlice?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ObjStructureExportProgress) => void;
}

const MATERIAL_NAME = 'minecraft_atlas';
const TEXTURE_FILE_NAME = 'textures/atlas.png';
const OBJ_WRITE_BUFFER_CHARS = 384 * 1024;
const TEXTURE_EXPORT_MAX_ATLAS_SIZE = 8192;
const TEXTURE_EXPORT_PADDING = 2;
const TEXTURE_EXPORT_SCALES = [16, 12, 8, 6, 4, 2, 1] as const;
const FALLBACK_FULL_ATLAS_MAX_SCALE = 4;

interface SourceTextureRect {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PackedTextureRect extends SourceTextureRect {
  outputX: number;
  outputY: number;
  outputWidth: number;
  outputHeight: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
}

interface TextureExportPlan {
  sourceWidth: number;
  sourceHeight: number;
  atlasWidth: number;
  atlasHeight: number;
  scale: number;
  rects: Map<string, PackedTextureRect>;
}

const isWebGL2 = (gl: GLContext): gl is WebGL2RenderingContext => (
  typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
);

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException('OBJ export aborted', 'AbortError');
  }
};

export const safeObjPackageName = (name: string, fallback = 'structure') => {
  const trimmed = name.trim().replace(/\.[^/.]+$/, '');
  const cleaned = trimmed
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
};

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(6)).toString();
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toSourceCanvas = (imageData: ImageData) => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot create canvas context for texture export');
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

const textureRectFromVertex = (
  vertices: Float32Array,
  offset: number,
  sourceWidth: number,
  sourceHeight: number,
): SourceTextureRect | null => {
  const values = [
    vertices[offset + 5],
    vertices[offset + 6],
    vertices[offset + 7],
    vertices[offset + 8],
  ];
  if (values.some((value) => !Number.isFinite(value))) return null;

  const [u0, v0, u1, v1] = values;
  const left = clamp(Math.round(Math.min(u0, u1) * sourceWidth), 0, sourceWidth);
  const top = clamp(Math.round(Math.min(v0, v1) * sourceHeight), 0, sourceHeight);
  const right = clamp(Math.round(Math.max(u0, u1) * sourceWidth), 0, sourceWidth);
  const bottom = clamp(Math.round(Math.max(v0, v1) * sourceHeight), 0, sourceHeight);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;

  return {
    key: `${left},${top},${width},${height}`,
    x: left,
    y: top,
    width,
    height,
  };
};

const collectMeshTextureRects = (
  mesh: ChunkMeshData | undefined,
  imageData: ImageData,
  rects: Map<string, SourceTextureRect>,
) => {
  if (!mesh || mesh.vertices.length === 0) return;

  const quadStride = VERTEX_FLOATS * 4;
  for (let offset = 0; offset < mesh.vertices.length; offset += quadStride) {
    const rect = textureRectFromVertex(mesh.vertices, offset, imageData.width, imageData.height);
    if (rect) rects.set(rect.key, rect);
  }
};

const collectChunkTextureRects = (
  result: ChunkBuildResult,
  imageData: ImageData,
  rects: Map<string, SourceTextureRect>,
) => {
  collectMeshTextureRects(result.solid, imageData, rects);
  collectMeshTextureRects(result.transparent, imageData, rects);
};

const packTextureRects = (
  sourceRects: SourceTextureRect[],
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
): TextureExportPlan | null => {
  const rects = [...sourceRects].sort((a, b) => {
    const heightDiff = b.height - a.height;
    return heightDiff !== 0 ? heightDiff : b.width - a.width;
  });
  const packedRects = new Map<string, PackedTextureRect>();
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let usedWidth = 0;
  let usedHeight = 0;

  for (const rect of rects) {
    const contentWidth = rect.width * scale;
    const contentHeight = rect.height * scale;
    const outputWidth = contentWidth + TEXTURE_EXPORT_PADDING * 2;
    const outputHeight = contentHeight + TEXTURE_EXPORT_PADDING * 2;
    if (
      outputWidth > TEXTURE_EXPORT_MAX_ATLAS_SIZE
      || outputHeight > TEXTURE_EXPORT_MAX_ATLAS_SIZE
    ) {
      return null;
    }

    if (cursorX > 0 && cursorX + outputWidth > TEXTURE_EXPORT_MAX_ATLAS_SIZE) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    if (cursorY + outputHeight > TEXTURE_EXPORT_MAX_ATLAS_SIZE) {
      return null;
    }

    const packed: PackedTextureRect = {
      ...rect,
      outputX: cursorX,
      outputY: cursorY,
      outputWidth,
      outputHeight,
      contentX: cursorX + TEXTURE_EXPORT_PADDING,
      contentY: cursorY + TEXTURE_EXPORT_PADDING,
      contentWidth,
      contentHeight,
    };
    packedRects.set(rect.key, packed);

    cursorX += outputWidth;
    rowHeight = Math.max(rowHeight, outputHeight);
    usedWidth = Math.max(usedWidth, cursorX);
    usedHeight = Math.max(usedHeight, cursorY + rowHeight);
  }

  if (packedRects.size === 0 || usedWidth <= 0 || usedHeight <= 0) return null;

  return {
    sourceWidth,
    sourceHeight,
    atlasWidth: usedWidth,
    atlasHeight: usedHeight,
    scale,
    rects: packedRects,
  };
};

const createTextureExportPlan = (
  rects: Map<string, SourceTextureRect>,
  imageData: ImageData,
) => {
  if (rects.size === 0) return null;

  const sourceRects = [...rects.values()];
  for (const scale of TEXTURE_EXPORT_SCALES) {
    const plan = packTextureRects(sourceRects, imageData.width, imageData.height, scale);
    if (plan) return plan;
  }

  return null;
};

const remapTextureUv = (
  vertices: Float32Array,
  offset: number,
  plan: TextureExportPlan | null,
): [number, number] | null => {
  if (!plan) return null;

  const rect = textureRectFromVertex(vertices, offset, plan.sourceWidth, plan.sourceHeight);
  if (!rect) return null;

  const packed = plan.rects.get(rect.key);
  if (!packed) return null;

  const u = vertices[offset + 3];
  const v = vertices[offset + 4];
  const localU = clamp((u * plan.sourceWidth - rect.x) / rect.width, 0, 1);
  const localV = clamp((v * plan.sourceHeight - rect.y) / rect.height, 0, 1);

  return [
    (packed.contentX + localU * packed.contentWidth) / plan.atlasWidth,
    (packed.contentY + localV * packed.contentHeight) / plan.atlasHeight,
  ];
};

const drawPackedRect = (
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  rect: PackedTextureRect,
) => {
  const padding = TEXTURE_EXPORT_PADDING;
  ctx.drawImage(
    sourceCanvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    rect.contentX,
    rect.contentY,
    rect.contentWidth,
    rect.contentHeight,
  );

  if (padding <= 0) return;

  const rightSource = rect.x + rect.width - 1;
  const bottomSource = rect.y + rect.height - 1;
  const rightOutput = rect.contentX + rect.contentWidth;
  const bottomOutput = rect.contentY + rect.contentHeight;

  ctx.drawImage(sourceCanvas, rect.x, rect.y, 1, rect.height, rect.outputX, rect.contentY, padding, rect.contentHeight);
  ctx.drawImage(sourceCanvas, rightSource, rect.y, 1, rect.height, rightOutput, rect.contentY, padding, rect.contentHeight);
  ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.width, 1, rect.contentX, rect.outputY, rect.contentWidth, padding);
  ctx.drawImage(sourceCanvas, rect.x, bottomSource, rect.width, 1, rect.contentX, bottomOutput, rect.contentWidth, padding);
  ctx.drawImage(sourceCanvas, rect.x, rect.y, 1, 1, rect.outputX, rect.outputY, padding, padding);
  ctx.drawImage(sourceCanvas, rightSource, rect.y, 1, 1, rightOutput, rect.outputY, padding, padding);
  ctx.drawImage(sourceCanvas, rect.x, bottomSource, 1, 1, rect.outputX, bottomOutput, padding, padding);
  ctx.drawImage(sourceCanvas, rightSource, bottomSource, 1, 1, rightOutput, bottomOutput, padding, padding);
};

const createPackedTextureCanvas = (imageData: ImageData, plan: TextureExportPlan) => {
  const sourceCanvas = toSourceCanvas(imageData);
  const canvas = document.createElement('canvas');
  canvas.width = plan.atlasWidth;
  canvas.height = plan.atlasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot create canvas context for packed texture export');
  }

  ctx.imageSmoothingEnabled = false;
  for (const rect of plan.rects.values()) {
    drawPackedRect(ctx, sourceCanvas, rect);
  }
  return canvas;
};

const createFullTextureCanvas = (imageData: ImageData) => {
  const maxDimension = Math.max(imageData.width, imageData.height);
  const scale = Math.max(
    1,
    Math.min(
      FALLBACK_FULL_ATLAS_MAX_SCALE,
      Math.floor(TEXTURE_EXPORT_MAX_ATLAS_SIZE / maxDimension) || 1,
    ),
  );

  if (scale <= 1) {
    return toSourceCanvas(imageData);
  }

  const sourceCanvas = toSourceCanvas(imageData);
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width * scale;
  canvas.height = imageData.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot create canvas context for texture export');
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const imageDataToPngBytes = async (
  imageData: ImageData,
  texturePlan: TextureExportPlan | null,
  signal?: AbortSignal,
) => {
  throwIfAborted(signal);
  const canvas = texturePlan
    ? createPackedTextureCanvas(imageData, texturePlan)
    : createFullTextureCanvas(imageData);
  throwIfAborted(signal);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Cannot encode texture atlas as PNG');
  }
  throwIfAborted(signal);
  return new Uint8Array(await blob.arrayBuffer());
};

const createMtlText = () => [
  '# Exported by MCSTools 3DBLOCKS',
  '',
  `newmtl ${MATERIAL_NAME}`,
  'Ka 0 0 0',
  'Kd 1 1 1',
  'Ks 0 0 0',
  'd 1',
  'illum 2',
  `map_Kd ${TEXTURE_FILE_NAME}`,
  `map_d ${TEXTURE_FILE_NAME}`,
  '',
].join('\n');

class StreamingObjWriter {
  private readonly encoder = new TextEncoder();
  private readonly lines: string[] = [];
  private bufferedChars = 0;
  private vertexCount = 0;
  bytesWritten = 0;
  triangleCount = 0;
  hasGeometry = false;

  constructor(
    private readonly file: FileHandle,
    private readonly signal?: AbortSignal,
    private readonly texturePlan: TextureExportPlan | null = null,
  ) {}

  async writeHeader(mtlFileName: string) {
    this.line('# Exported by MCSTools 3DBLOCKS');
    this.line(`mtllib ${mtlFileName}`);
    this.line('');
    this.line(`usemtl ${MATERIAL_NAME}`);
    await this.flushBuffer();
  }

  async appendMesh(name: string, mesh?: ChunkMeshData) {
    if (!mesh || mesh.indices.length === 0 || mesh.vertices.length === 0) return;

    const localVertexCount = mesh.vertices.length / VERTEX_FLOATS;
    const globalBase = this.vertexCount;

    this.line('');
    this.line(`o ${name}`);
    this.line(`usemtl ${MATERIAL_NAME}`);

    for (let index = 0; index < localVertexCount; index += 1) {
      const offset = index * VERTEX_FLOATS;
      this.line(
        `v ${formatNumber(mesh.vertices[offset])} ${formatNumber(mesh.vertices[offset + 1])} ${formatNumber(mesh.vertices[offset + 2])}`
        + ` ${formatNumber(mesh.vertices[offset + 9])} ${formatNumber(mesh.vertices[offset + 10])} ${formatNumber(mesh.vertices[offset + 11])}`,
      );
      if (this.shouldFlush()) await this.flushBuffer();
    }

    for (let index = 0; index < localVertexCount; index += 1) {
      const offset = index * VERTEX_FLOATS;
      const mappedUv = remapTextureUv(mesh.vertices, offset, this.texturePlan);
      const u = mappedUv?.[0] ?? mesh.vertices[offset + 3];
      const v = mappedUv?.[1] ?? mesh.vertices[offset + 4];
      this.line(`vt ${formatNumber(u)} ${formatNumber(1 - v)}`);
      if (this.shouldFlush()) await this.flushBuffer();
    }

    for (let index = 0; index < localVertexCount; index += 1) {
      const offset = index * VERTEX_FLOATS;
      this.line(`vn ${formatNumber(mesh.vertices[offset + 12])} ${formatNumber(mesh.vertices[offset + 13])} ${formatNumber(mesh.vertices[offset + 14])}`);
      if (this.shouldFlush()) await this.flushBuffer();
    }

    for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
      const a = globalBase + mesh.indices[index] + 1;
      const b = globalBase + mesh.indices[index + 1] + 1;
      const c = globalBase + mesh.indices[index + 2] + 1;
      this.line(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
      if (this.shouldFlush()) await this.flushBuffer();
    }

    this.vertexCount += localVertexCount;
    this.triangleCount += mesh.triangleCount;
    this.hasGeometry = true;
  }

  async flush() {
    await this.flushBuffer();
  }

  private line(value: string) {
    this.lines.push(value);
    this.bufferedChars += value.length + 1;
  }

  private shouldFlush() {
    return this.bufferedChars >= OBJ_WRITE_BUFFER_CHARS;
  }

  private async flushBuffer() {
    throwIfAborted(this.signal);
    if (this.lines.length === 0) return;

    const data = this.encoder.encode(`${this.lines.join('\n')}\n`);
    this.lines.length = 0;
    this.bufferedChars = 0;
    const written = await this.file.write(data);
    this.bytesWritten += written;
    throwIfAborted(this.signal);
  }
}

const appendChunkMeshes = async (writer: StreamingObjWriter, result: ChunkBuildResult) => {
  const [x, y, z] = result.chunkPos;
  await writer.appendMesh(`chunk_${x}_${y}_${z}_solid`, result.solid);
  await writer.appendMesh(`chunk_${x}_${y}_${z}_transparent`, result.transparent);
};

export const exportObjStructurePackageToDirectory = async ({
  world,
  resources,
  gl,
  name,
  targetDirectory,
  chunkSize,
  blocksPerSlice = 1200,
  signal,
  onProgress,
}: ObjStructurePackageOptions): Promise<ObjStructurePackageResult> => {
  const baseName = safeObjPackageName(name);
  const outputDirectory = await join(targetDirectory, `${baseName}_obj`);
  const objPath = await join(outputDirectory, `${baseName}.obj`);
  const mtlPath = await join(outputDirectory, `${baseName}.mtl`);
  const textureDirectory = await join(outputDirectory, 'textures');
  const texturePath = await join(textureDirectory, 'atlas.png');

  const rendererChunkSize = chunkSize ?? ThreeDBlocksRenderer.getAdaptiveChunkSize(world);
  const activeChunkSize = Math.max(4, Math.min(8, rendererChunkSize));
  const supportsUint32Indices = isWebGL2(gl) || !!gl.getExtension('OES_element_index_uint');
  const builder = new ChunkMeshBuilder(gl, world, resources, activeChunkSize, supportsUint32Indices);
  const chunkPositions = world.getChunkPositions(activeChunkSize);
  const textureAtlas = resources.getTextureAtlas();
  let objFile: FileHandle | null = null;

  const report = (
    stage: ObjStructureExportStage,
    builtChunks: number,
    triangleCount: number,
    bytesWritten: number,
  ) => {
    const geometryPercent = chunkPositions.length > 0
      ? Math.min(1, builtChunks / chunkPositions.length)
      : 0;
    const stageBasePercent = (() => {
      if (stage === 'prepare') return geometryPercent * 5;
      if (stage === 'geometry') return 5 + geometryPercent * 82;
      if (stage === 'material') return 90;
      if (stage === 'texture') return 96;
      return 100;
    })();
    onProgress?.({
      stage,
      builtChunks,
      totalChunks: chunkPositions.length,
      triangleCount,
      bytesWritten,
      percent: Math.round(stageBasePercent),
    });
  };

  throwIfAborted(signal);
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(textureDirectory, { recursive: true });
  report('prepare', 0, 0, 0);

  try {
    const textureRects = new Map<string, SourceTextureRect>();
    await builder.buildChunksProgressiveAsync(
      chunkPositions,
      blocksPerSlice,
      signal,
      async (result, builtChunks) => {
        collectChunkTextureRects(result, textureAtlas, textureRects);
        report('prepare', builtChunks, 0, 0);
      },
    );
    const texturePlan = createTextureExportPlan(textureRects, textureAtlas);

    objFile = await createFile(objPath);
    const writer = new StreamingObjWriter(objFile, signal, texturePlan);
    await writer.writeHeader(`${baseName}.mtl`);

    await builder.buildChunksProgressiveAsync(
      chunkPositions,
      blocksPerSlice,
      signal,
      async (result, builtChunks) => {
        await appendChunkMeshes(writer, result);
        report('geometry', builtChunks, writer.triangleCount, writer.bytesWritten);
      },
    );

    await writer.flush();
    if (!writer.hasGeometry) {
      throw new Error('No exportable geometry');
    }

    report('material', chunkPositions.length, writer.triangleCount, writer.bytesWritten);
    await writeFile(mtlPath, new TextEncoder().encode(createMtlText()));

    report('texture', chunkPositions.length, writer.triangleCount, writer.bytesWritten);
    await writeFile(texturePath, await imageDataToPngBytes(textureAtlas, texturePlan, signal));

    report('done', chunkPositions.length, writer.triangleCount, writer.bytesWritten);
    return {
      outputDirectory,
      objPath,
      mtlPath,
      texturePath,
      triangleCount: writer.triangleCount,
      bytesWritten: writer.bytesWritten,
      chunkCount: chunkPositions.length,
    };
  } finally {
    await objFile?.close().catch(() => undefined);
  }
};
