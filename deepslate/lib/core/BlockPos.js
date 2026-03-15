import { NbtInt, NbtList } from '../nbt/index.js';
import { Json } from '../util/index.js';
import { Direction } from './Direction.js';
export var BlockPos;
(function (BlockPos) {
    function create(x, y, z) {
        return [x, y, z];
    }
    BlockPos.create = create;
    BlockPos.ZERO = BlockPos.create(0, 0, 0);
    function offset(pos, dx, dy, dz) {
        return [pos[0] + dx, pos[1] + dy, pos[2] + dz];
    }
    BlockPos.offset = offset;
    function subtract(pos, other) {
        return [pos[0] - other[0], pos[1] - other[1], pos[2] - other[2]];
    }
    BlockPos.subtract = subtract;
    function add(pos, other) {
        return [pos[0] + other[0], pos[1] + other[1], pos[2] + other[2]];
    }
    BlockPos.add = add;
    function towards(pos, dir) {
        return BlockPos.offset(pos, ...Direction.normal(dir));
    }
    BlockPos.towards = towards;
    function equals(a, b) {
        if (a === b)
            return true;
        return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    }
    BlockPos.equals = equals;
    function magnitude(pos) {
        return pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2];
    }
    BlockPos.magnitude = magnitude;
    function toNbt(pos) {
        return new NbtList(pos.map(e => new NbtInt(e)));
    }
    BlockPos.toNbt = toNbt;
    function fromNbt(nbt) {
        return nbt.getAsTuple(3, e => e?.isInt() ? e.getAsNumber() : 0);
    }
    BlockPos.fromNbt = fromNbt;
    function fromJson(obj) {
        const array = Json.readArray(obj, (e) => Json.readInt(e) ?? 0) ?? [0, 0, 0];
        return create(array[0], array[1], array[2]);
    }
    BlockPos.fromJson = fromJson;
})(BlockPos || (BlockPos = {}));
//# sourceMappingURL=BlockPos.js.map