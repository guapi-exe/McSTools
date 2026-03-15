import type { NoiseSettings } from './NoiseSettings.js';
export declare type VerticalAnchor = (context: NoiseSettings) => number;
export declare namespace VerticalAnchor {
    function fromJson(obj: unknown): VerticalAnchor;
    function absolute(value: number): VerticalAnchor;
    function aboveBottom(value: number): VerticalAnchor;
    function belowTop(value: number): VerticalAnchor;
}
//# sourceMappingURL=VerticalAnchor.d.ts.map