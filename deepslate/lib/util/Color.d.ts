import type { NbtTag } from '../nbt/index.js';
export declare type Color = [number, number, number];
export declare namespace Color {
    function fromJson(obj: unknown): Color | undefined;
    function fromNbt(nbt: NbtTag): Color | undefined;
    function intToRgb(n: number): Color;
}
//# sourceMappingURL=Color.d.ts.map