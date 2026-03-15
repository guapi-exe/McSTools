import type { BlockPos } from '../../core/index.js';
import { Holder, Identifier, Registry } from '../../core/index.js';
import { StructurePlacement } from './StructurePlacement.js';
import { WorldgenStructure } from './WorldgenStructure.js';
export declare class StructureSet {
    readonly structures: StructureSet.StructureSelectionEntry[];
    readonly placement: StructurePlacement;
    static readonly REGISTRY: Registry<StructureSet>;
    constructor(structures: StructureSet.StructureSelectionEntry[], placement: StructurePlacement);
    static fromJson(obj: unknown): StructureSet;
    getStructureInChunk(chunkX: number, chunkZ: number, context: WorldgenStructure.GenerationContext): {
        id: Identifier;
        pos: BlockPos;
    } | undefined;
}
export declare namespace StructureSet {
    class StructureSelectionEntry {
        readonly structure: Holder<WorldgenStructure>;
        readonly weight: number;
        constructor(structure: Holder<WorldgenStructure>, weight: number);
        static fromJson(obj: unknown): StructureSelectionEntry;
    }
}
//# sourceMappingURL=StructureSet.d.ts.map