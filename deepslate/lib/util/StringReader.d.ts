export declare class StringReader {
    readonly source: string;
    cursor: number;
    constructor(source: string);
    get remainingLength(): number;
    get totalLength(): number;
    getRead(start?: number): string;
    getRemaining(): string;
    canRead(length?: number): boolean;
    peek(offset?: number): string;
    read(): string;
    skip(): void;
    skipWhitespace(): void;
    expect(c: string, skipWhitespace?: boolean): void;
    readInt(): number;
    readFloat(): number;
    readUnquotedString(): string;
    readQuotedString(): string;
    readString(): string;
    readStringUntil(terminator: string): string;
    readBoolean(): boolean;
    static isAllowedInNumber(c: string): boolean;
    static isAllowedInUnquotedString(c: string): boolean;
    static isQuotedStringStart(c: string): boolean;
    static isWhitespace(c: string): boolean;
    createError(message: string): Error;
}
//# sourceMappingURL=StringReader.d.ts.map