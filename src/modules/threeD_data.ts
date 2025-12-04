import {ref} from "vue";
import {BlockPos, Structure, StructureRenderer} from "deepslate";
import {CameraState, InteractiveCanvas} from "./threed_data/deepslateInit.ts";

export const structure_l = ref<Structure>();
export const size_l = ref<BlockPos>();
export const camera_l = ref<CameraState>()
export const loading_threeD = ref(false);
export const once_threeD = ref<boolean>(false);
export const currentLayer = ref(0);
export const layerMap = new Map<number, Array<{
    pos: [number, number, number],
    block: { id: string, properties: any }
}>>();
export const layers = ref<Record<number, Array<{pos: BlockPos, block: {id: string, properties: any}}>>>({});
export const structureRenderer = ref<StructureRenderer | null>(null);
export const interactiveCanvas = ref<InteractiveCanvas | null>(null);
export const gl_ctx = ref<WebGLRenderingContext | null>(null);
