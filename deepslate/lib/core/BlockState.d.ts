import type { NbtCompound } from '../nbt/index.js';
import { Identifier } from './Identifier.js';
export declare class BlockState {
    private readonly properties;
    static readonly AIR: BlockState;
    static readonly STONE: BlockState;
    static readonly WATER: BlockState;
    static readonly LAVA: BlockState;
    private readonly name;
    constructor(name: Identifier | string, properties?: {
        [key: string]: string;
    });
    getName(): Identifier;
    getProperties(): {
        [key: string]: string;
    };
    getProperty(key: string): string | undefined;
    isFluid(): boolean;
    isWaterlogged(): boolean;
    equals(other: BlockState): boolean;
    is(other: string | Identifier | BlockState): boolean;
    toString(): string;
    static parse(str: string): BlockState;
    static fromNbt(nbt: NbtCompound): BlockState;
    static fromJson(obj: unknown): BlockState;
}
//# sourceMappingURL=BlockState.d.ts.map