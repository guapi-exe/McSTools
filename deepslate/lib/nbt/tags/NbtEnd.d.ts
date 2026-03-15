import type { JsonValue } from '../../util/Json.js';
import { NbtTag } from './NbtTag.js';
import { NbtType } from './NbtType.js';
export declare class NbtEnd extends NbtTag {
    static readonly INSTANCE: NbtEnd;
    private constructor();
    getId(): NbtType;
    equals(other: NbtTag): boolean;
    toString(): string;
    toPrettyString(): string;
    toSimplifiedJson(): null;
    toJson(): JsonValue;
    toBytes(): void;
    static create(): NbtEnd;
    static fromJson(): NbtEnd;
    static fromBytes(): NbtEnd;
}
//# sourceMappingURL=NbtEnd.d.ts.map