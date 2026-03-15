import type { ItemComponentsProvider } from '../core/index.js';
import { Identifier, ItemStack } from '../core/index.js';
import type { ItemRendererResources, ItemRenderingContext } from './ItemRenderer.js';
import { ItemTint } from './ItemTint.js';
import { Mesh } from './Mesh.js';
import { SpecialModel } from './SpecialModel.js';
export interface ItemModelProvider {
    getItemModel(id: Identifier): ItemModel | null;
}
export interface ItemModel {
    getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
}
export declare namespace ItemModel {
    function fromJson(obj: unknown): ItemModel;
    class Empty {
        getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
    }
    class Model {
        private readonly modelId;
        private readonly tints;
        constructor(modelId: Identifier, tints: ItemTint[]);
        getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
    }
    class Composite {
        private readonly models;
        constructor(models: ItemModel[]);
        getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
    }
    class Condition {
        private readonly property;
        private readonly onTrue;
        private readonly onFalse;
        constructor(property: (item: ItemStack, resources: ItemComponentsProvider, context: ItemRenderingContext) => boolean, onTrue: ItemModel, onFalse: ItemModel);
        getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
        static propertyFromJson(root: {
            [x: string]: unknown;
        }): (item: ItemStack, resources: ItemComponentsProvider, context: ItemRenderingContext) => boolean;
    }
    class Select {
        private readonly property;
        private readonly cases;
        private readonly fallback?;
        constructor(property: (item: ItemStack, resources: ItemComponentsProvider, context: ItemRenderingContext) => string | null, cases: Map<string, ItemModel>, fallback?: ItemModel | undefined);
        getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
        static propertyFromJson(root: {
            [x: string]: unknown;
        }): (item: ItemStack, resources: ItemComponentsProvider, context: ItemRenderingContext) => string | null;
    }
    class RangeDispatch {
        private readonly property;
        private readonly scale;
        private readonly fallback?;
        private readonly entries;
        constructor(property: (item: ItemStack, resources: ItemComponentsProvider, context: ItemRenderingContext) => number, scale: number, entries: {
            threshold: number;
            model: ItemModel;
        }[], fallback?: ItemModel | undefined);
        getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
        static propertyFromJson(root: {
            [x: string]: unknown;
        }): (item: ItemStack, resources: ItemComponentsProvider, context: ItemRenderingContext) => number;
    }
    class Special {
        private readonly specialModel;
        private readonly base;
        constructor(specialModel: SpecialModel, base: Identifier);
        getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
    }
    class BundleSelectedItem {
        getMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
    }
}
//# sourceMappingURL=ItemModel.d.ts.map