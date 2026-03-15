import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export class NbtEnd extends NbtTag {
    static INSTANCE = new NbtEnd();
    constructor() {
        super();
    }
    getId() {
        return NbtType.End;
    }
    equals(other) {
        return other.isEnd();
    }
    toString() {
        return 'END';
    }
    toPrettyString() {
        return this.toString();
    }
    toSimplifiedJson() {
        return null;
    }
    toJson() {
        return null;
    }
    toBytes() {
    }
    static create() {
        return NbtEnd.INSTANCE;
    }
    static fromJson() {
        return NbtEnd.INSTANCE;
    }
    static fromBytes() {
        return NbtEnd.INSTANCE;
    }
}
NbtTag.register(NbtType.End, NbtEnd);
//# sourceMappingURL=NbtEnd.js.map