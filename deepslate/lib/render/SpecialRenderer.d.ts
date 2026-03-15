import type { BlockState } from '../core/index.js';
import { Identifier } from '../core/index.js';
import type { NbtCompound, NbtList } from '../nbt/index.js';
import { Cull } from './Cull.js';
import { Mesh } from './Mesh.js';
import type { TextureAtlasProvider } from './TextureAtlas.js';
export declare namespace SpecialRenderers {
    function chestRenderer(texture: Identifier): (atlas: TextureAtlasProvider) => Mesh;
    function decoratedPotRenderer(atlas: TextureAtlasProvider): Mesh;
    function shieldRenderer(atlas: TextureAtlasProvider): Mesh;
    function headRenderer(texture: Identifier, n: number): (atlas: TextureAtlasProvider) => Mesh;
    function dragonHeadRenderer(texture?: Identifier): (atlas: TextureAtlasProvider) => Mesh;
    function piglinHeadRenderer(texture?: Identifier): (atlas: TextureAtlasProvider) => Mesh;
    function signRenderer(texture: Identifier): (atlas: TextureAtlasProvider) => Mesh;
    function wallSignRenderer(texture: Identifier): (atlas: TextureAtlasProvider) => Mesh;
    function hangingSignRenderer(texture: Identifier): (attached: boolean, atlas: TextureAtlasProvider) => Mesh;
    function wallHangingSignRenderer(woodType: string): (atlas: TextureAtlasProvider) => Mesh;
    function conduitRenderer(atlas: TextureAtlasProvider): Mesh;
    function shulkerBoxRenderer(texture: Identifier): (atlas: TextureAtlasProvider) => Mesh;
    const bannerRenderer: (color: string) => (atlas: TextureAtlasProvider, patterns?: NbtList<NbtCompound>) => Mesh;
    const wallBannerRenderer: (color: string) => (atlas: TextureAtlasProvider, patterns?: NbtList<NbtCompound>) => Mesh;
    function bellRenderer(atlas: TextureAtlasProvider): Mesh;
    function bedRenderer(texture: Identifier): (part: string, atlas: TextureAtlasProvider) => Mesh;
    function getBlockMesh(block: BlockState, nbt: NbtCompound | undefined, atlas: TextureAtlasProvider, cull: Cull): Mesh;
}
//# sourceMappingURL=SpecialRenderer.d.ts.map