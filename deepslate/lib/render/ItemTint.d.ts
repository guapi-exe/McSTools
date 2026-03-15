import type { ItemComponentsProvider, ItemStack } from '../core/index.js';
import { Color } from '../util/index.js';
import type { ItemRenderingContext } from './ItemRenderer.js';
export interface ItemTint {
    getTint(item: ItemStack, resources: ItemComponentsProvider, context: ItemRenderingContext): Color;
}
export declare namespace ItemTint {
    function fromJson(obj: unknown): ItemTint;
    class Constant {
        value: Color;
        constructor(value: Color);
        getTint(item: ItemStack): Color;
    }
    class Dye {
        default_color: Color;
        constructor(default_color: Color);
        getTint(item: ItemStack, resources: ItemComponentsProvider): Color;
    }
    class Grass {
        temperature: number;
        downfall: number;
        constructor(temperature: number, downfall: number);
        getTint(item: ItemStack): Color;
    }
    class Firework {
        default_color: Color;
        constructor(default_color: Color);
        getTint(item: ItemStack, resources: ItemComponentsProvider): Color;
    }
    class Potion {
        default_color: Color;
        constructor(default_color: Color);
        getTint(item: ItemStack, resources: ItemComponentsProvider): Color;
    }
    class MapColor {
        default_color: Color;
        constructor(default_color: Color);
        getTint(item: ItemStack, resources: ItemComponentsProvider): Color;
    }
    class CustomModelData {
        index: number;
        default_color: Color;
        constructor(index: number, default_color: Color);
        getTint(item: ItemStack, resources: ItemComponentsProvider): Color;
    }
    class Team {
        default_color: Color;
        constructor(default_color: Color);
        getTint(item: ItemStack, resources: ItemComponentsProvider, context: ItemRenderingContext): Color;
    }
}
//# sourceMappingURL=ItemTint.d.ts.map