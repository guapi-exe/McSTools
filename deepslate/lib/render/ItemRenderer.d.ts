import { mat4 } from 'gl-matrix';
import type { ItemComponentsProvider, ItemStack } from '../core/ItemStack.js';
import { Identifier } from '../core/index.js';
import type { Color } from '../index.js';
import type { BlockModelProvider, Display } from './BlockModel.js';
import type { ItemModelProvider } from './ItemModel.js';
import { Mesh } from './Mesh.js';
import { Renderer } from './Renderer.js';
import type { TextureAtlasProvider } from './TextureAtlas.js';
export interface ItemRendererResources extends BlockModelProvider, TextureAtlasProvider, ItemModelProvider, ItemComponentsProvider {
}
export interface ItemRenderingContext {
    display_context?: Display;
    'fishing_rod/cast'?: boolean;
    'bundle/selected_item'?: number;
    selected?: boolean;
    carried?: boolean;
    extended_view?: boolean;
    context_entity_is_view_entity?: boolean;
    keybind_down?: string[];
    main_hand?: 'left' | 'right';
    context_entity_type?: Identifier;
    context_entity_team_color?: Color;
    context_dimension?: Identifier;
    cooldown_percentage?: {
        [key: string]: number;
    };
    game_time?: number;
    compass_angle?: number;
    use_duration?: number;
    max_use_duration?: number;
    'crossbow/pull'?: number;
}
export declare class ItemRenderer extends Renderer {
    private item;
    private readonly resources;
    private mesh;
    private readonly atlasTexture;
    constructor(gl: WebGLRenderingContext, item: ItemStack, resources: ItemRendererResources, context?: ItemRenderingContext);
    setItem(item: ItemStack, context?: ItemRenderingContext): void;
    updateMesh(context?: ItemRenderingContext): void;
    static getItemMesh(item: ItemStack, resources: ItemRendererResources, context: ItemRenderingContext): Mesh;
    protected getPerspective(): mat4;
    drawItem(): void;
}
//# sourceMappingURL=ItemRenderer.d.ts.map