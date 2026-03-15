export declare class Identifier {
    readonly namespace: string;
    readonly path: string;
    static readonly DEFAULT_NAMESPACE = "minecraft";
    static readonly SEPARATOR = ":";
    constructor(namespace: string, path: string);
    is(other: string): boolean;
    equals(other: unknown): boolean;
    toString(): string;
    withPrefix(prefix: string): Identifier;
    static create(path: string): Identifier;
    static parse(id: string): Identifier;
}
//# sourceMappingURL=Identifier.d.ts.map