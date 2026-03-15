export interface DataOutput {
    writeByte(value: number): void;
    writeShort(value: number): void;
    writeInt(value: number): void;
    writeFloat(value: number): void;
    writeDouble(value: number): void;
    writeBytes(bytes: ArrayLike<number>): void;
    writeString(value: string): void;
    getData(): Uint8Array;
}
export interface RawDataOutputOptions {
    littleEndian?: boolean;
    offset?: number;
    initialSize?: number;
}
export declare class RawDataOutput implements DataOutput {
    private readonly littleEndian;
    offset: number;
    private buffer;
    private array;
    private view;
    constructor(options?: RawDataOutputOptions);
    private accommodate;
    private writeNumber;
    writeByte: (value: number) => void;
    writeShort: (value: number) => void;
    writeInt: (value: number) => void;
    writeFloat: (value: number) => void;
    writeDouble: (value: number) => void;
    writeBytes(bytes: ArrayLike<number>): void;
    writeString(value: string): void;
    getData(): Uint8Array;
}
//# sourceMappingURL=DataOutput.d.ts.map