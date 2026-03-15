export declare class PalettedContainer<T extends Equalable> {
    readonly size: number;
    readonly defaultValue: T;
    private readonly storage;
    private readonly palette;
    constructor(size: number, defaultValue: T);
    private index;
    get(x: number, y: number, z: number): T;
    set(x: number, y: number, z: number, value: T): void;
}
interface Equalable {
    equals(other: this): boolean;
}
export {};
//# sourceMappingURL=PalettedContainer.d.ts.map