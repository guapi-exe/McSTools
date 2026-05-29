import { mat4 } from 'gl-matrix';
import {
  BlockDefinition,
  BlockModel,
  Identifier,
  TextureAtlas,
  type BlockFlags,
  type ItemRenderingContext,
  type ItemStack,
} from 'deepslate';
import { BlockWorld } from '../core/BlockWorld';
import { ThreeDBlocksRenderer } from '../renderer/ThreeDBlocksRenderer';
import type { RendererStats, ThreeDBlocksResources, Vec3 } from '../types';

export interface ThreeDBlocksSmokeResult {
  passed: boolean;
  context: 'webgl2' | 'webgl';
  size: Vec3;
  nonEmptyPixels: number;
  eagerStats: RendererStats;
  lazyStats: RendererStats;
  renderDistanceLimited: boolean;
  lazyUploadWorked: boolean;
  durationMs: number;
}

const createCubeModel = () => BlockModel.fromJson({
  textures: { all: 'minecraft:block/smoke' },
  elements: [{
    from: [0, 0, 0],
    to: [16, 16, 16],
    faces: {
      up: { texture: '#all', cullface: 'up' },
      down: { texture: '#all', cullface: 'down' },
      north: { texture: '#all', cullface: 'north' },
      south: { texture: '#all', cullface: 'south' },
      west: { texture: '#all', cullface: 'west' },
      east: { texture: '#all', cullface: 'east' },
    },
  }],
});

const createSmokeAtlas = () => {
  const image = new ImageData(16, 16);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = 168;
    image.data[i + 1] = 210;
    image.data[i + 2] = 95;
    image.data[i + 3] = 255;
  }
  return new TextureAtlas(image, {
    'minecraft:block/smoke': [0, 0, 1, 1],
  });
};

const createSmokeResources = (): ThreeDBlocksResources => {
  const atlas = createSmokeAtlas();
  const blockDefinition = BlockDefinition.fromJson({
    variants: {
      '': { model: 'minecraft:block/smoke_cube' },
    },
  });
  const blockModel = createCubeModel();
  const blockDefinitions = new Map([
    ['minecraft:stone', blockDefinition],
    ['minecraft:glass', blockDefinition],
  ]);
  const blockModels = new Map([
    ['minecraft:block/smoke_cube', blockModel],
  ]);

  return {
    getBlockDefinition(id: Identifier) {
      return blockDefinitions.get(id.toString()) ?? null;
    },
    getBlockModel(id: Identifier) {
      return blockModels.get(id.toString()) ?? null;
    },
    getTextureUV(id: Identifier) {
      return atlas.getTextureUV(id);
    },
    getTextureAtlas() {
      return atlas.getTextureAtlas();
    },
    getPixelSize() {
      return atlas.getPixelSize();
    },
    getBlockFlags(id: Identifier): BlockFlags | null {
      if (id.toString() === 'minecraft:glass') {
        return { opaque: false, semi_transparent: true };
      }
      return { opaque: true };
    },
    getBlockProperties() {
      return null;
    },
    getDefaultBlockProperties() {
      return {};
    },
    getItemModel() {
      return null;
    },
    getItemComponents() {
      return null;
    },
    getItemTint() {
      return undefined;
    },
    getItemModelResolver() {
      return null;
    },
    getItemDefinitions() {
      return null;
    },
    getItemRenderingContext(_item?: ItemStack): ItemRenderingContext {
      return {};
    },
  } as ThreeDBlocksResources;
};

const addSmokeBlocks = (addBlock: (pos: Vec3, id: string) => void) => {
  const size: Vec3 = [32, 16, 32];
  for (let x = 0; x < size[0]; x += 1) {
    for (let z = 0; z < size[2]; z += 1) {
      for (let y = 0; y < 5; y += 1) {
        addBlock([x, y, z], 'minecraft:stone');
      }
      if (x % 6 === 0 && z % 6 === 0) {
        for (let y = 5; y < 12; y += 1) {
          addBlock([x, y, z], 'minecraft:glass');
        }
      }
    }
  }
  return size;
};

const createSmokeWorld = () => {
  const size: Vec3 = [32, 16, 32];
  const world = new BlockWorld(size);
  addSmokeBlocks((pos, id) => world.addBlock(pos, id));
  return world;
};

const createView = (size: Vec3) => {
  const view = mat4.create();
  mat4.translate(view, view, [0, 0, -72]);
  mat4.rotate(view, view, -0.62, [1, 0, 0]);
  mat4.rotate(view, view, 0.72, [0, 1, 0]);
  mat4.translate(view, view, [-size[0] / 2, -size[1] / 2, -size[2] / 2]);
  return view;
};

const countNonEmptyPixels = (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
  const { width, height } = gl.canvas as HTMLCanvasElement;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 0) {
      count += 1;
    }
  }
  return count;
};

const createCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:512px;height:384px;';
  document.body.appendChild(canvas);
  return canvas;
};

const getContext = (canvas: HTMLCanvasElement) => {
  const webgl2 = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (webgl2) return { gl: webgl2, context: 'webgl2' as const };

  const webgl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (webgl) return { gl: webgl, context: 'webgl' as const };

  throw new Error('3DBLOCKS smoke test requires WebGL');
};

const reportResult = (result: ThreeDBlocksSmokeResult | Error) => {
  const target = document.getElementById('three-dblocks-smoke-result') ?? document.createElement('pre');
  target.id = 'three-dblocks-smoke-result';
  target.textContent = JSON.stringify(
    result instanceof Error
      ? { passed: false, error: result.message, stack: result.stack }
      : result,
    null,
    2,
  );
  document.body.appendChild(target);
};

const postResultIfRequested = async (payload: unknown) => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('3dblocksSmokeReport')) return;

  await fetch('/__3dblocks_smoke_result', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.warn('[3DBLOCKS smoke] result POST failed', error);
  });
};

export const runThreeDBlocksBrowserSmoke = async (): Promise<ThreeDBlocksSmokeResult> => {
  const start = performance.now();
  const canvas = createCanvas();
  const { gl, context } = getContext(canvas);
  const resources = createSmokeResources();
  const world = createSmokeWorld();
  const view = createView(world.getSize());
  const lazyView = mat4.create();

  const eagerRenderer = new ThreeDBlocksRenderer(gl, world, resources, {
    chunkSize: 8,
    lazyUpload: false,
    versionTag: '3DBLOCKS-smoke-eager',
  });
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  eagerRenderer.drawStructure(view);
  eagerRenderer.drawGrid(view);
  const nonEmptyPixels = countNonEmptyPixels(gl);
  const eagerStats = eagerRenderer.getStats();
  eagerRenderer.dispose();

  const lazyRenderer = new ThreeDBlocksRenderer(gl, world, resources, {
    chunkSize: 8,
    lazyUpload: true,
    renderDistanceChunks: 1,
    versionTag: '3DBLOCKS-smoke-lazy',
  });
  const beforeLazyDraw = lazyRenderer.getStats();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  lazyRenderer.drawStructure(lazyView);
  const lazyStats = lazyRenderer.getStats();
  lazyRenderer.dispose();
  canvas.remove();

  const lazyUploadWorked = beforeLazyDraw.gpuChunks === 0 && lazyStats.gpuChunks > 0;
  const renderDistanceLimited = lazyStats.visibleChunks > 0 && lazyStats.visibleChunks < lazyStats.chunkCount;
  const passed = eagerStats.triangles > 0
    && eagerStats.chunkCount > 0
    && eagerStats.gpuChunks === eagerStats.chunkCount
    && nonEmptyPixels > 0
    && lazyUploadWorked
    && renderDistanceLimited;

  return {
    passed,
    context,
    size: world.getSize(),
    nonEmptyPixels,
    eagerStats,
    lazyStats,
    renderDistanceLimited,
    lazyUploadWorked,
    durationMs: performance.now() - start,
  };
};

export const runAndReportThreeDBlocksBrowserSmoke = async () => {
  try {
    const result = await runThreeDBlocksBrowserSmoke();
    window.__threeDBlocksSmokeResult = result;
    document.body.dataset.threeDblocksSmoke = result.passed ? 'passed' : 'failed';
    reportResult(result);
    await postResultIfRequested(result);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = { passed: false as const, error: err.message, stack: err.stack };
    window.__threeDBlocksSmokeResult = payload;
    document.body.dataset.threeDblocksSmoke = 'failed';
    reportResult(err);
    await postResultIfRequested(payload);
    throw err;
  }
};

declare global {
  interface Window {
    __threeDBlocksSmokeResult?: ThreeDBlocksSmokeResult | { passed: false; error: string; stack?: string };
  }
}
