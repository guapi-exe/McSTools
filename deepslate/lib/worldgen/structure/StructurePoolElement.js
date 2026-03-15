import { BlockPos, BlockState, Identifier, Structure } from '../../core/index.js';
import { shuffle } from '../../math/index.js';
import { NbtCompound, NbtString } from '../../nbt/index.js';
import { Json } from '../../util/index.js';
export class StructurePoolElement {
    static fromJson(obj) {
        const root = Json.readObject(obj) ?? {};
        switch (Json.readString(root.element_type)?.replace(/^minecraft:/, '')) {
            case 'single_pool_element':
            case 'legacy_single_pool_element':
                const id = Identifier.parse(Json.readString(root.location) ?? '');
                const template = {
                    key: () => id,
                    value: () => Structure.REGISTRY.get(id) ?? Structure.EMPTY,
                };
                return new StructurePoolElement.SinlgePoolElement(template);
            case 'list_pool_element':
                const elements = Json.readArray('elements', StructurePoolElement.fromJson) ?? [];
                return new StructurePoolElement.ListPoolElement(elements);
            case 'feature_pool_element':
                return new StructurePoolElement.FeaturePoolElement();
            case 'empty_pool_element':
            default:
                return new StructurePoolElement.EmptyPoolElement();
        }
    }
}
(function (StructurePoolElement) {
    class EmptyPoolElement extends StructurePoolElement {
        getBoundingBox(pos, rotation) {
            throw new Error('Invalid call of EmptyPoolElement');
        }
        getShuffledJigsawBlocks(rotation, random) {
            return [];
        }
        toString() {
            return '[Empty Pool Element]';
        }
    }
    StructurePoolElement.EmptyPoolElement = EmptyPoolElement;
    class FeaturePoolElement extends StructurePoolElement {
        defaultJigsawNBT;
        constructor() {
            super();
            const compoundMap = new Map();
            compoundMap.set('name', new NbtString('minecraft:bottom'));
            compoundMap.set('final_state', new NbtString('minecraft:air'));
            compoundMap.set('pool', new NbtString('minecraft:empty'));
            compoundMap.set('target', new NbtString('minecraft:empty'));
            compoundMap.set('joint', new NbtString('rollable'));
            this.defaultJigsawNBT = new NbtCompound(compoundMap);
        }
        getBoundingBox(pos, rotation) {
            return [pos, pos];
        }
        getShuffledJigsawBlocks(rotation, random) {
            return [{
                    pos: [0, 0, 0],
                    state: new BlockState(Identifier.create('jigsaw'), {
                        orientation: 'down_south',
                    }),
                    nbt: this.defaultJigsawNBT,
                }];
        }
        toString() {
            return '[Feature Pool Element]';
        }
    }
    StructurePoolElement.FeaturePoolElement = FeaturePoolElement;
    class SinlgePoolElement extends StructurePoolElement {
        template;
        static JIGSAW_ID = Identifier.parse('jigsaw');
        constructor(template) {
            super();
            this.template = template;
        }
        getBoundingBox(pos, rotation) {
            const size = BlockPos.offset(this.template.value().getSize(), -1, -1, -1);
            const pos1 = pos;
            const pos2 = BlockPos.add(Structure.transform(size, rotation, BlockPos.ZERO), pos);
            const minPos = BlockPos.create(Math.min(pos1[0], pos2[0]), pos1[1], Math.min(pos1[2], pos2[2]));
            const maxPos = BlockPos.create(Math.max(pos1[0], pos2[0]), pos2[1], Math.max(pos1[2], pos2[2]));
            return [minPos, maxPos];
        }
        getShuffledJigsawBlocks(rotation, random) {
            const blocks = this.template.value().getBlocks().filter(block => block.state.getName().equals(SinlgePoolElement.JIGSAW_ID));
            blocks.forEach(block => block.pos = Structure.transform(block.pos, rotation, BlockPos.ZERO)); // TODO? Rotate state
            shuffle(blocks, random);
            return blocks;
        }
        toString() {
            return `[Single Pool Element: ${this.template.key()}]`;
        }
    }
    StructurePoolElement.SinlgePoolElement = SinlgePoolElement;
    class ListPoolElement extends StructurePoolElement {
        elements;
        constructor(elements) {
            super();
            this.elements = elements;
        }
        getBoundingBox(pos, rotation) {
            var minPos = undefined;
            var maxPos = undefined;
            for (const element of this.elements) {
                const elementBoundingBox = element.getBoundingBox(pos, rotation);
                if (!minPos || !maxPos) {
                    minPos = elementBoundingBox[0];
                    maxPos = elementBoundingBox[1];
                }
                else {
                    minPos[0] = Math.min(minPos[0], elementBoundingBox[0][0]);
                    minPos[1] = Math.min(minPos[1], elementBoundingBox[0][1]);
                    minPos[2] = Math.min(minPos[2], elementBoundingBox[0][2]);
                    maxPos[0] = Math.min(minPos[0], elementBoundingBox[1][0]);
                    maxPos[1] = Math.min(minPos[1], elementBoundingBox[1][1]);
                    maxPos[2] = Math.min(minPos[2], elementBoundingBox[1][2]);
                }
            }
            return [minPos, maxPos];
        }
        getShuffledJigsawBlocks(rotation, random) {
            return this.elements[0].getShuffledJigsawBlocks(rotation, random);
        }
        toString() {
            return `[List Pool Element: ${'; '.concat(...this.elements.map(e => e.toString()))}]`;
        }
    }
    StructurePoolElement.ListPoolElement = ListPoolElement;
})(StructurePoolElement || (StructurePoolElement = {}));
//# sourceMappingURL=StructurePoolElement.js.map