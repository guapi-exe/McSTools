import { BlockState } from './BlockState.js';
import { ChunkSection } from './ChunkSection.js';
export class Chunk {
    minY;
    height;
    pos;
    sections;
    constructor(minY, height, pos) {
        this.minY = minY;
        this.height = height;
        this.pos = pos;
        this.sections = Array(this.sectionsCount).fill(null);
    }
    get maxY() {
        return this.minY + this.height;
    }
    get minSection() {
        return this.minY >> 4;
    }
    get maxSection() {
        return ((this.maxY - 1) >> 4) + 1;
    }
    get sectionsCount() {
        return this.maxSection - this.minSection;
    }
    getSectionIndex(y) {
        return (y >> 4) - this.minSection;
    }
    getBlockState(pos) {
        const [x, y, z] = pos;
        const section = this.sections[this.getSectionIndex(y)];
        return section?.getBlockState(x & 0xF, y & 0xF, z & 0xF) ?? BlockState.AIR;
    }
    setBlockState(pos, state) {
        const [x, y, z] = pos;
        const sectionIndex = this.getSectionIndex(y);
        let section = this.sections[sectionIndex];
        if (section === null) {
            if (state.equals(BlockState.AIR))
                return;
            section = this.getOrCreateSection(sectionIndex);
        }
        section.setBlockState(x & 0xF, y & 0xF, z & 0xF, state);
    }
    getOrCreateSection(index) {
        if (this.sections[index] == null) {
            this.sections[index] = new ChunkSection(this.minSection + index);
        }
        return this.sections[index];
    }
}
//# sourceMappingURL=Chunk.js.map