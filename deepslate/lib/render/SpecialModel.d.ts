import type { ItemStack, TextureAtlasProvider } from '../index.js';
import { Mesh } from './Mesh.js';
export interface SpecialModel {
    getMesh(item: ItemStack, resources: TextureAtlasProvider): Mesh;
}
export declare namespace SpecialModel {
    function fromJson(obj: unknown): SpecialModel;
}
//# sourceMappingURL=SpecialModel.d.ts.map