import type { NbtCompound, NbtTag } from '../nbt/index.js';
import { Color } from '../util/index.js';
import { Identifier } from './Identifier.js';
export declare const EFFECT_COLORS: Map<string, number>;
export declare type MobEffectInstance = {
    effect: Identifier;
    duration: number;
    amplifier: number;
};
export declare namespace MobEffectInstance {
    function fromNbt(tag: NbtCompound): MobEffectInstance;
}
export declare const POTION_EFFECTS: Map<string, MobEffectInstance[]>;
export declare type PotionContents = {
    potion?: Identifier;
    customColor?: number;
    customEffects?: MobEffectInstance[];
};
export declare namespace PotionContents {
    function fromNbt(tag: NbtTag): PotionContents;
    function getColor(contents: PotionContents): Color;
    function getAllEffects(contents: PotionContents): MobEffectInstance[];
}
//# sourceMappingURL=Effects.d.ts.map