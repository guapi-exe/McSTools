import { Holder, Registry } from '../../core/index.js';
import type { Random } from '../../math/index.js';
import { StructurePoolElement } from './StructurePoolElement.js';
export declare class StructureTemplatePool {
    rawTemplates: {
        element: StructurePoolElement;
        weight: number;
    }[];
    fallback: Holder<StructureTemplatePool>;
    static readonly REGISTRY: Registry<StructureTemplatePool>;
    private readonly totalWeight;
    constructor(rawTemplates: {
        element: StructurePoolElement;
        weight: number;
    }[], fallback: Holder<StructureTemplatePool>);
    private static readonly structurePoolParser;
    static fromJson(obj: unknown): StructureTemplatePool;
    getRandomTemplate(random: Random): StructurePoolElement;
}
//# sourceMappingURL=StructureTemplatePool.d.ts.map