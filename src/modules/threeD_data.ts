import {ref, shallowRef} from "vue";
import type {BlockWorld, CameraState, InteractiveCanvas, ThreeDBlocksRenderer, Vec3} from "./3DBLOCKS";

export type CompactLayerBlocks = Int32Array;

export const structure_l = shallowRef<BlockWorld>();
export const size_l = shallowRef<Vec3>();
export const camera_l = ref<CameraState>()
export const loading_threeD = ref(false);
export const once_threeD = ref<boolean>(false);
export const currentLayer = ref(0);
export const layerMap = new Map<number, CompactLayerBlocks>();
export const layers = shallowRef<Record<number, CompactLayerBlocks>>({});
export const structureRenderer = shallowRef<ThreeDBlocksRenderer | null>(null);
export const interactiveCanvas = shallowRef<InteractiveCanvas | null>(null);
export const gl_ctx = shallowRef<(WebGLRenderingContext | WebGL2RenderingContext) | null>(null);
