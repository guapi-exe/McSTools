import type { Holder, PlacedBlock, Rotation } from '../../core/index.js';
import { BlockPos, Structure } from '../../core/index.js';
import type { Random } from '../../math/index.js';
export declare abstract class StructurePoolElement {
    static fromJson(obj: unknown): StructurePoolElement;
    abstract getBoundingBox(pos: BlockPos, rotation: Rotation): [BlockPos, BlockPos];
    abstract getShuffledJigsawBlocks(rotation: Rotation, random: Random): PlacedBlock[];
}
export declare namespace StructurePoolElement {
    class EmptyPoolElement extends StructurePoolElement {
        getBoundingBox(pos: BlockPos, rotation: Rotation): [BlockPos, BlockPos];
        getShuffledJigsawBlocks(rotation: Rotation, random: Random): PlacedBlock[];
        toString(): string;
    }
    class FeaturePoolElement extends StructurePoolElement {
        private readonly defaultJigsawNBT;
        constructor();
        getBoundingBox(pos: BlockPos, rotation: Rotation): [BlockPos, BlockPos];
        getShuffledJigsawBlocks(rotation: Rotation, random: Random): PlacedBlock[];
        toString(): string;
    }
    class SinlgePoolElement extends StructurePoolElement {
        private readonly template;
        private static readonly JIGSAW_ID;
        constructor(template: Holder<Structure>);
        getBoundingBox(pos: BlockPos, rotation: Rotation): [BlockPos, BlockPos];
        getShuffledJigsawBlocks(rotation: Rotation, random: Random): PlacedBlock[];
        toString(): string;
    }
    class ListPoolElement extends StructurePoolElement {
        private readonly elements;
        constructor(elements: StructurePoolElement[]);
        getBoundingBox(pos: BlockPos, rotation: Rotation): [BlockPos, BlockPos];
        getShuffledJigsawBlocks(rotation: Rotation, random: Random): PlacedBlock[];
        toString(): string;
    }
}
//# sourceMappingURL=StructurePoolElement.d.ts.map