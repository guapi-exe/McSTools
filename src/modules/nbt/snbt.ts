import * as nbt from "./tag.ts";

export interface StringifyOptions {
    pretty?: boolean;
    breakLength?: number;
    quote?: "single" | "double";
    quoteKeys?: boolean;
}

export interface ParseOptions {
    useMaps?: boolean;
}

const unquotedRegExp = /^[0-9A-Za-z.+_-]+$/;

export function toSNBT(tag: nbt.Tag, pretty = false): string {
    return stringifyTag(tag, {
        pretty,
        breakLength: pretty ? 70 : Infinity,
        quote: "double",
    });
}

export function stringifyTag(tag: nbt.Tag, options: StringifyOptions = {}): string {
    const pretty = !!options.pretty;
    const breakLength = options.breakLength ?? 70;
    const quoteChar = options.quote === "single" ? "'" : '"';
    const spaces = " ".repeat(4);

    function escapeString(text: string): string {
        return `${quoteChar}${text.replace(new RegExp(`[${quoteChar}\\\\]`, "g"), x => `\\${x}`)}${quoteChar}`;
    }

    function isSafeKey(key: string) {
        return /^[0-9A-Za-z._+-]+$/.test(key);
    }

    function unwrapValue(tag: any): any {
        if (tag && typeof tag === "object" && "value" in tag && Object.keys(tag).length === 1) {
            return unwrapValue(tag.value);
        }
        return tag;
    }

    function inner(tag: any, depth: number): string {
        tag = unwrapValue(tag);

        const space = pretty ? " " : "";
        const sep = pretty ? ", " : ",";

        if (tag instanceof nbt.Byte) return `${tag.value}b`;
        if (tag instanceof nbt.Short) return `${tag.value}s`;
        if (tag instanceof nbt.Int) return `${tag.value}`;
        if (typeof tag === "bigint") return `${tag}l`;
        if (tag instanceof nbt.Float) return `${tag.value}f`;
        if (typeof tag === "number") return Number.isInteger(tag) ? `${tag}` : tag.toString();
        if (typeof tag === "string") return escapeString(tag);

        if (tag instanceof Uint8Array || tag instanceof Int8Array)
            return `[B;${[...tag].map(v => v + 'b').join(sep)}]`;
        if (tag instanceof Int32Array)
            return `[I;${[...tag].join(sep)}]`;
        if (tag instanceof BigInt64Array)
            return `[L;${[...tag].map(v => v + 'l').join(sep)}]`;

        if (Array.isArray(tag)) {
            const list = tag.map(t => inner(t, depth + 1));
            if (pretty && (list.join(sep).length > breakLength || list.some(x => x.includes("\n")))) {
                return `[\n${list.map(x => spaces.repeat(depth) + x).join(",\n")}\n${spaces.repeat(depth - 1)}]`;
            } else {
                return `[${list.join(sep)}]`;
            }
        }

        const entries = tag instanceof Map ? [...tag] : Object.entries(tag);

        const pairs = entries.map(([key, value]) => {
            value = unwrapValue(value);
            const safeKey = isSafeKey(key) ? key : escapeString(key);

            if (value === null || value === undefined) {
                return `"${safeKey}":{}`;
            }

            if ((key === "Count" || key === "Slot") && Number.isInteger(value)) {
                return `"${safeKey}":${space}${value}b`;
            }

            return `"${safeKey}":${space}${inner(value, depth + 1)}`;
        });

        if (pretty && pairs.reduce((acc, x) => acc + x.length, 0) > breakLength) {
            return `{\n${pairs.map(x => spaces.repeat(depth) + x).join(",\n")}\n${spaces.repeat(depth - 1)}}`;
        }

        return `{${space}${pairs.join(sep)}${space}}`;
    }

    return inner(tag, 1);
}

export function stringify(tag: nbt.Tag, options: StringifyOptions = {}): string {
    const pretty = !!options.pretty;
    const breakLength = options.breakLength ?? 70;
    const quoteChar = options.quote === "single" ? "'" : options.quote === "double" ? '"' : null;
    const spaces = " ".repeat(4);

    function floatingLiteral(value: number): string {
        if (Object.is(value, -0)) return '-0.0';
        const text = String(value);
        // The native reader requires a decimal point/exponent for floats,
        // including whole-valued Float/Double tags such as 0.0 and 1.0.
        return Number.isFinite(value) && !/[.eE]/.test(text) ? `${text}.0` : text;
    }

    function escapeString(text: string): string {
        let q = quoteChar ?? '"';
        if (quoteChar == null) {
            for (let i = 0; i < text.length && i < 8; i++) {
                switch (text[i]) {
                    case "'":
                        q = '"';
                        break;
                    case '"':
                        q = "'";
                        break;
                    default: continue;
                }
                break;
            }
        }
        return `${q}${text.replace(new RegExp(`[${q}\\\\]`, "g"), x => `\\${x}`)}${q}`;
    }

    function stringifyInner(tag: nbt.Tag, depth: number): string {
        const space = pretty ? " " : "";
        const sep = pretty ? ", " : ",";

        if (tag instanceof nbt.Byte) return `${tag.value}b`;
        if (tag instanceof nbt.Short) return `${tag.value}s`;
        if (tag instanceof nbt.Int) return `${tag.value | 0}`;
        if (typeof tag === "bigint") return `${tag}l`;
        if (tag instanceof nbt.Float) return `${floatingLiteral(tag.value)}f`;
        if (typeof tag === "number") return `${floatingLiteral(tag)}d`;
        if (typeof tag === "string") return escapeString(tag);
        if (tag instanceof Uint8Array || tag instanceof Int8Array) return `[B;${space}${[...tag].map(v => `${(v << 24) >> 24}b`).join(sep)}]`;
        if (tag instanceof Int32Array) return `[I;${space}${[...tag].join(sep)}]`;
        if (tag instanceof BigInt64Array) return `[L;${space}${[...tag].map(v => `${v}l`).join(sep)}]`;
        if (Array.isArray(tag)) {
            const list = tag.map(t => stringifyInner(t, depth + 1));
            if (pretty && (list.reduce((acc, x) => acc + x.length, 0) > breakLength || list.some(x => x.includes("\n")))) {
                return `[\n${list.map(x => spaces.repeat(depth) + x).join(",\n")}\n${spaces.repeat(depth - 1)}]`;
            } else {
                return `[${list.join(sep)}]`;
            }
        }

        const entries = tag instanceof Map
            ? [...tag]
            : Object.entries(tag).filter(([_, v]) => v != null);

        const pairs = entries.map(([key, t]) => {
            if (options.quoteKeys || !unquotedRegExp.test(key)) key = escapeString(key);
            return `${key}:${space}${stringifyInner(t, depth + 1)}`;
        });

        if (pretty && pairs.reduce((acc, x) => acc + x.length, 0) > breakLength) {
            return `{\n${pairs.map(x => spaces.repeat(depth) + x).join(",\n")}\n${spaces.repeat(depth - 1)}}`;
        }

        return `{${space}${pairs.join(sep)}${space}}`;
    }

    return stringifyInner(tag, 1);
}

export function parse(text: string, options: ParseOptions = {}): nbt.Tag {
    let index = 0;
    let i = 0;
    let char = "";

    const unexpectedEnd = () => new Error("Unexpected end");
    const unexpectedChar = (pos?: number) => {
        pos ??= index;
        return new Error(`Unexpected character ${text[index]} at position ${index}`);
    };

    function skipWhitespace() {
        while (index < text.length && /\s/.test(text[index])) index++;
    }

    function readNumber(): nbt.Tag | null {
        const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?([bBsSlLfFdD]?)/.exec(text.slice(index));
        if (!match || (index + match[0].length < text.length && unquotedRegExp.test(text[index + match[0].length]))) return null;
        index += match[0].length;
        const suffix = match[1].toLowerCase(), raw = suffix ? match[0].slice(0, -1) : match[0];
        if (suffix === 'l') {
            const value = BigInt(raw);
            if (value < -(1n << 63n) || value >= (1n << 63n)) throw new Error('Long 超出 64 位范围');
            return value;
        }
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new Error('数值超出范围');
        if (suffix === 'f') return new nbt.Float(value);
        if (suffix === 'd' || (!suffix && /[.eE]/.test(raw))) return value;
        const limit = suffix === 'b' ? 128 : suffix === 's' ? 32768 : 2147483648;
        if (!Number.isInteger(value) || value < -limit || value >= limit) throw new Error('整数超出 NBT 类型范围');
        return suffix === 'b' ? new nbt.Byte(value) : suffix === 's' ? new nbt.Short(value) : new nbt.Int(value);
    }

    function readUnquotedString(): string {
        i = index;
        while (index < text.length && unquotedRegExp.test(text[index])) index++;
        if (index - i === 0) throw index === text.length ? unexpectedEnd() : unexpectedChar();
        return text.slice(i, index);
    }

    function readQuotedString(): string {
        const quoteChar = text[index];
        i = ++index;
        let string = "";
        while (index < text.length) {
            char = text[index++];
            if (char === "\\") {
                string += text.slice(i, index - 1) + text[index];
                i = ++index;
            } else if (char === quoteChar) return string + text.slice(i, index - 1);
        }
        throw unexpectedEnd();
    }

    function readString(): string {
        if (text[index] === '"' || text[index] === "'") return readQuotedString();
        return readUnquotedString();
    }

    function skipCommas(isFirst: boolean, end: string) {
        skipWhitespace();
        if (text[index] === ",") {
            if (isFirst) throw unexpectedChar();
            index++;
            skipWhitespace();
        } else if (!isFirst && text[index] !== end) {
            throw unexpectedChar();
        }
    }

    function readValue(): nbt.Tag {
        skipWhitespace();
        i = index;
        char = text[index];

        if (char === "{") { index++; return readCompound(); }
        if (char === "[") { index++; return readList(); }
        if (char === '"' || char === "'") return readQuotedString();

        const value = readNumber();
        if (value != null && (index === text.length || !unquotedRegExp.test(text[index]))) return value;

        return readUnquotedString();
    }

    function readCompound(): nbt.TagObject | nbt.TagMap {
        const entries: [string, nbt.Tag | null][] = [];
        let first = true;

        while (true) {
            skipCommas(first, "}");
            first = false;

            if (text[index] === "}") {
                index++;
                return options.useMaps
                    ? new Map(entries)
                    : Object.fromEntries(entries) as nbt.TagObject;
            }

            const key = readString();
            skipWhitespace();
            if (text[index++] !== ":") throw unexpectedChar();
            skipWhitespace();

            let value: nbt.Tag | null;
            if (text[index] === "," || text[index] === "}") throw unexpectedChar();
            else value = readValue();

            entries.push([key, value]);
        }
    }

    function readArray(type: string): Uint8Array | Int32Array | BigInt64Array {
        const array: (number | bigint)[] = [];
        while (index < text.length) {
            skipCommas(array.length === 0, "]");

            if (text[index] === "]") {
                index++;
                if (type === "B") return Uint8Array.from(array.map(v => typeof v === "bigint" ? Number(v) : v));
                if (type === "I") return Int32Array.from(array.map(v => typeof v === "bigint" ? Number(v) : v));
                if (type === "L") return BigInt64Array.from(array.map(v => BigInt(v)));
            }

            i = index;
            if (text[index] === "-") index++;
            while (index < text.length && "0123456789".includes(text[index])) index++;
            if (!/^-?\d+$/.test(text.slice(i, index))) throw unexpectedChar();

            const integer = BigInt(text.slice(i, index));
            const bound = type === 'B' ? 128n : type === 'I' ? 2147483648n : 1n << 63n;
            if (integer < -bound || integer >= bound) throw new Error('数组元素超出 NBT 类型范围');

            if (type === "L") {
                array.push(BigInt(text.slice(i, index)));
                if (text[index] === "l" || text[index] === "L") index++;
            } else if(type === "B" && (text[index] === "b" || text[index] === "B")) {
                array.push(Number(text.slice(i, index)));
                index++;
            } else {
                array.push(Number(text.slice(i, index)));
            }

        }
        throw unexpectedEnd();
    }


    function readList(): nbt.TagArray | Uint8Array | Int32Array | BigInt64Array {
        if ("BILbil".includes(text[index]) && text[index + 1] === ";") {
            return readArray(text[(index += 2) - 2].toUpperCase());
        }
        const array: nbt.TagArray = [];
        while (index < text.length) {
            skipWhitespace();
            if (text[index] === ",") {
                if (array.length === 0) throw unexpectedChar();
                index++;
                skipWhitespace();
            } else if (array.length > 0 && text[index] !== "]") {
                throw unexpectedChar(index - 1);
            }
            if (text[index] === "]") return index++, array;
            array.push(readValue());
        }
        throw unexpectedEnd();
    }

    const result = readValue();
    skipWhitespace();
    if (index !== text.length) throw unexpectedChar();
    return result;
}
