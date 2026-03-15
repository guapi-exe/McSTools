import { Holder, Registry } from '../../core/index.js';
import { Json } from '../../util/index.js';
import { StructurePoolElement } from './StructurePoolElement.js';
export class StructureTemplatePool {
    rawTemplates;
    fallback;
    static REGISTRY = Registry.createAndRegister('worldgen/template_pool', StructureTemplatePool.fromJson);
    totalWeight;
    constructor(rawTemplates, fallback) {
        this.rawTemplates = rawTemplates;
        this.fallback = fallback;
        this.totalWeight = rawTemplates.reduce((v, e) => v + e.weight, 0);
    }
    static structurePoolParser = Holder.parser(StructureTemplatePool.REGISTRY, StructureTemplatePool.fromJson);
    static fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        const fallback = StructureTemplatePool.structurePoolParser(root.fallback ?? '');
        const elements = Json.readArray(root.elements, (obj) => {
            const root = Json.readObject(obj) ?? {};
            const element = StructurePoolElement.fromJson(root.element);
            const weight = Json.readInt(root.weight) ?? 1;
            return { element, weight };
        }) ?? [];
        return new StructureTemplatePool(elements, fallback);
    }
    getRandomTemplate(random) {
        var v = random.nextInt(this.totalWeight);
        for (const entry of this.rawTemplates) {
            v -= entry.weight;
            if (v < 0) {
                return entry.element;
            }
        }
        return this.rawTemplates[this.rawTemplates.length - 1].element;
    }
}
//# sourceMappingURL=StructureTemplatePool.js.map