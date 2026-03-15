import { NbtType } from '../nbt/index.js';
import { BlockPos } from './BlockPos.js';
import { BlockState } from './BlockState.js';
import { Registry } from './Registry.js';
import { Rotation } from './Rotation.js';
export class Structure {
    size;
    palette;
    blocks;
    static REGISTRY = Registry.createAndRegister('structures');
    static EMPTY = new Structure(BlockPos.ZERO);
    blocksMap = [];
    constructor(size, palette = [], blocks = []) {
        this.size = size;
        this.palette = palette;
        this.blocks = blocks;
        blocks.forEach(block => {
            if (!this.isInside(block.pos)) {
                throw new Error(`Found block at ${block.pos} which is outside the structure bounds ${this.size}`);
            }
            this.blocksMap[block.pos[0] * size[1] * size[2] + block.pos[1] * size[2] + block.pos[2]] = block;
        });
    }
    getSize() {
        return this.size;
    }
    addBlock(pos, name, properties, nbt) {
        if (!this.isInside(pos)) {
            throw new Error(`Cannot add block at ${pos} outside the structure bounds ${this.size}`);
        }
        const blockState = new BlockState(name, properties);
        let state = this.palette.findIndex(b => b.equals(blockState));
        if (state === -1) {
            state = this.palette.length;
            this.palette.push(blockState);
        }
        this.blocks.push({ pos, state, nbt });
        this.blocksMap[pos[0] * this.size[1] * this.size[2] + pos[1] * this.size[2] + pos[2]] = { pos, state, nbt };
        return this;
    }
    getBlocks() {
        return this.blocks.map(b => this.toPlacedBlock(b));
    }
    forEachBlock(callback) {
        for (const block of this.blocks) {
            callback(this.toPlacedBlock(block));
        }
    }
    async forEachBlockAsync(callback) {
        for (const block of this.blocks) {
            await callback(this.toPlacedBlock(block));
        }
    }
    getBlock(pos) {
        if (!this.isInside(pos))
            return null;
        const block = this.blocksMap[pos[0] * this.size[1] * this.size[2] + pos[1] * this.size[2] + pos[2]];
        if (!block)
            return null;
        return this.toPlacedBlock(block);
    }
    getBlockState(pos) {
        if (!this.isInside(pos))
            return null;
        const block = this.blocksMap[pos[0] * this.size[1] * this.size[2] + pos[1] * this.size[2] + pos[2]];
        if (!block)
            return null;
        const state = this.palette[block.state];
        if (!state) {
            throw new Error(`Block at ${pos.join(' ')} in structure references invalid palette index ${block.state}`);
        }
        return state;
    }
    toPlacedBlock(block) {
        const state = this.palette[block.state];
        if (!state) {
            throw new Error(`Block at ${block.pos.join(' ')} in structure references invalid palette index ${block.state}`);
        }
        return {
            pos: block.pos,
            state: state,
            nbt: block.nbt,
        };
    }
    isInside(pos) {
        return pos[0] >= 0 && pos[0] < this.size[0]
            && pos[1] >= 0 && pos[1] < this.size[1]
            && pos[2] >= 0 && pos[2] < this.size[2];
    }
    static fromNbt(nbt) {
        const size = BlockPos.fromNbt(nbt.getList('size'));
        const palette = nbt.getList('palette', NbtType.Compound).map(tag => BlockState.fromNbt(tag));
        const blocks = nbt.getList('blocks', NbtType.Compound).map(tag => {
            const pos = BlockPos.fromNbt(tag.getList('pos'));
            const state = tag.getNumber('state');
            const nbt = tag.getCompound('nbt');
            return { pos, state, nbt: nbt.size > 0 ? nbt : undefined };
        });
        return new Structure(size, palette, blocks);
    }
    static transform(pos, rotation, pivot) {
        switch (rotation) {
            case Rotation.COUNTERCLOCKWISE_90:
                return BlockPos.create(pivot[0] - pivot[2] + pos[2], pos[1], pivot[0] + pivot[2] - pos[0]);
            case Rotation.CLOCKWISE_90:
                return BlockPos.create(pivot[0] + pivot[2] - pos[2], pos[1], pivot[2] - pivot[0] + pos[0]);
            case Rotation.CLOCKWISE_180:
                return BlockPos.create(pivot[0] + pivot[0] - pos[0], pos[1], pivot[2] + pivot[2] - pos[2]);
            default:
                return pos;
        }
    }
}
//# sourceMappingURL=Structure.js.map