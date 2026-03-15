export interface DataInput {
    readByte(): number;
    readInt(): number;
    readShort(): number;
    readFloat(): number;
    readDouble(): number;
    readBytes(length: number): ArrayLike<number>;
    readString(): string;
}
export interface RawDataInputOptions {
    littleEndian?: boolean;
    offset?: number;
}
export declare class RawDataInput implements DataInput {
    private readonly littleEndian;
    offset: number;
    private readonly array;
    private readonly view;
    constructor(input: Uint8Array | ArrayLike<number> | ArrayBufferLike, options?: RawDataInputOptions);
    private readNumber;
    readByte: () => number;
    readShort: () => number;
    readInt: () => number;
    readFloat: () => number;
    readDouble: () => number;
    readBytes(length: number): ArrayLike<number>;
    readString(): string;
}
//# sourceMappingURL=DataInput.d.ts.map