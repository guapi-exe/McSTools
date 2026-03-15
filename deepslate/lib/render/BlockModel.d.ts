import { mat4 } from 'gl-matrix';
import type { Direction } from '../core/index.js';
import { Identifier } from '../core/index.js';
import type { Color } from '../util/index.js';
import type { Cull } from './Cull.js';
import { Mesh } from './Mesh.js';
import type { TextureAtlasProvider, UV } from './TextureAtlas.js';
declare type Axis = 'x' | 'y' | 'z';
export declare type Display = 'thirdperson_righthand' | 'thirdperson_lefthand' | 'firstperson_righthand' | 'firstperson_lefthand' | 'gui' | 'head' | 'ground' | 'fixed' | 'none';
declare type BlockModelFace = {
    texture: string;
    uv?: UV;
    cullface?: Direction;
    rotation?: 0 | 90 | 180 | 270;
    tintindex?: number;
};
declare type BlockModelElement = {
    from: number[];
    to: number[];
    rotation?: {
        origin: [number, number, number];
        axis: Axis;
        angle: number;
        rescale?: boolean;
    };
    faces?: {
        [key in Direction]?: BlockModelFace;
    };
};
declare type BlockModelDisplay = {
    [key in Display]?: {
        rotation?: [number, number, number];
        translation?: [number, number, number];
        scale?: [number, number, number];
    };
};
declare type BlockModelGuiLight = 'front' | 'side';
export interface BlockModelProvider {
    getBlockModel(id: Identifier): BlockModel | null;
}
export declare class BlockModel {
    private parent;
    private textures;
    private elements;
    private display?;
    private guiLight?;
    private static readonly BUILTIN_GENERATED;
    private static readonly GENERATED_LAYERS;
    private generationMarker;
    constructor(parent: Identifier | undefined, textures: {
        [key: string]: string;
    } | undefined, elements: BlockModelElement[] | undefined, display?: BlockModelDisplay | undefined, guiLight?: BlockModelGuiLight | undefined);
    getDisplayTransform(display: Display): mat4;
    getMesh(atlas: TextureAtlasProvider, cull: Cull, tint?: Color | ((index: number) => Color)): Mesh;
    getElementMesh(e: BlockModelElement, atlas: TextureAtlasProvider, cull: Cull, getTint: (index?: number) => Color): Mesh;
    private getTexture;
    flatten(accessor: BlockModelProvider): void;
    private getParent;
    static fromJson(data: any): BlockModel;
}
export {};
//# sourceMappingURL=BlockModel.d.ts.map