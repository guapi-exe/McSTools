import { BlockState } from './BlockState.js';
import { PalettedContainer } from './PalettedContainer.js';
export class ChunkSection {
    minY;
    static WIDTH = 16;
    static SIZE = ChunkSection.WIDTH * ChunkSection.WIDTH * ChunkSection.WIDTH;
    states;
    constructor(minY) {
        this.minY = minY;
        this.states = new PalettedContainer(ChunkSection.SIZE, BlockState.AIR);
    }
    get minBlockY() {
        return this.minY << 4;
    }
    getBlockState(x, y, z) {
        return this.states.get(x, y, z);
    }
    setBlockState(x, y, z, state) {
        this.states.set(x, y, z, state);
    }
}
//# sourceMappingURL=ChunkSection.js.map