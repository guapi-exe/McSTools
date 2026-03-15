import type { NbtTag } from '../nbt/index.js';
import { NbtCompound } from '../nbt/index.js';
import { Identifier } from './Identifier.js';
export interface ItemComponentsProvider {
    getItemComponents: (id: Identifier) => Map<string, NbtTag>;
}
export declare class ItemStack {
    id: Identifier;
    count: number;
    components: Map<string, NbtTag>;
    constructor(id: Identifier, count: number, components?: Map<string, NbtTag>);
    getComponent<T>(key: string | Identifier, baseComponents: ItemComponentsProvider | undefined): NbtTag | undefined;
    hasComponent(key: string | Identifier, baseComponents: ItemComponentsProvider | undefined): boolean;
    clone(): ItemStack;
    is(other: string | Identifier | ItemStack): boolean;
    equals(other: unknown): boolean;
    isSameItemSameComponents(other: ItemStack): boolean;
    toString(): string;
    static fromString(string: string): ItemStack;
    toNbt(): NbtCompound;
    static fromNbt(nbt: NbtCompound): ItemStack;
}
//# sourceMappingURL=ItemStack.d.ts.map