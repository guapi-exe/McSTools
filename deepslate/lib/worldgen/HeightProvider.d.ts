import type { Random } from '../math/index.js';
import type { NoiseSettings } from './NoiseSettings.js';
import { VerticalAnchor } from './VerticalAnchor.js';
export declare type HeightProvider = (random: Random, context: NoiseSettings) => number;
export declare namespace HeightProvider {
    function fromJson(obj: unknown): HeightProvider;
    function constant(anchor: VerticalAnchor): HeightProvider;
    function uniform(minInclusive: VerticalAnchor, maxInclusive: VerticalAnchor): HeightProvider;
    function biased_to_bottom(minInclusive: VerticalAnchor, maxInclusive: VerticalAnchor, inner?: number): HeightProvider;
    function very_biased_to_bottom(minInclusive: VerticalAnchor, maxInclusive: VerticalAnchor, inner?: number): HeightProvider;
    function trapezoid(minInclusive: VerticalAnchor, maxInclusive: VerticalAnchor, plateau?: number): HeightProvider;
    function weighted_list(distribution: {
        weight: number;
        data: HeightProvider;
    }[]): HeightProvider;
}
//# sourceMappingURL=HeightProvider.d.ts.map