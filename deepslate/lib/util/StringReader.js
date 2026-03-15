export class StringReader {
    source;
    cursor;
    constructor(source) {
        this.source = source;
        this.cursor = 0;
    }
    get remainingLength() {
        return this.source.length - this.cursor;
    }
    get totalLength() {
        return this.source.length;
    }
    getRead(start = 0) {
        return this.source.substring(start, this.cursor);
    }
    getRemaining() {
        return this.source.substring(this.cursor);
    }
    canRead(length = 1) {
        return this.cursor + length <= this.source.length;
    }
    peek(offset = 0) {
        return this.source.charAt(this.cursor + offset);
    }
    read() {
        return this.source.charAt(this.cursor++);
    }
    skip() {
        this.cursor += 1;
    }
    skipWhitespace() {
        while (this.canRead() && StringReader.isWhitespace(this.peek())) {
            this.skip();
        }
    }
    expect(c, skipWhitespace = false) {
        if (skipWhitespace) {
            this.skipWhitespace();
        }
        if (!this.canRead() || this.peek() !== c) {
            throw this.createError(`Expected '${c}'`);
        }
        this.skip();
    }
    readInt() {
        const start = this.cursor;
        while (this.canRead() && StringReader.isAllowedInNumber(this.peek())) {
            this.skip();
        }
        const number = this.getRead(start);
        if (number.length === 0) {
            throw this.createError('Expected integer');
        }
        try {
            const value = Number(number);
            if (isNaN(value) || !Number.isInteger(value)) {
                throw new Error();
            }
            return value;
        }
        catch (e) {
            this.cursor = start;
            throw this.createError(`Invalid integer '${number}'`);
        }
    }
    readFloat() {
        const start = this.cursor;
        while (this.canRead() && StringReader.isAllowedInNumber(this.peek())) {
            this.skip();
        }
        const number = this.getRead(start);
        if (number.length === 0) {
            throw this.createError('Expected float');
        }
        try {
            const value = Number(number);
            if (isNaN(value)) {
                throw new Error();
            }
            return value;
        }
        catch (e) {
            this.cursor = start;
            throw this.createError(`Invalid float '${number}'`);
        }
    }
    readUnquotedString() {
        const start = this.cursor;
        while (this.canRead() && StringReader.isAllowedInUnquotedString(this.peek())) {
            this.skip();
        }
        return this.getRead(start);
    }
    readQuotedString() {
        if (!this.canRead()) {
            return '';
        }
        const c = this.peek();
        if (!StringReader.isQuotedStringStart(c)) {
            throw this.createError('Expected quote to start a string');
        }
        this.skip();
        return this.readStringUntil(c);
    }
    readString() {
        if (!this.canRead()) {
            return '';
        }
        const c = this.peek();
        if (StringReader.isQuotedStringStart(c)) {
            this.skip();
            return this.readStringUntil(c);
        }
        return this.readUnquotedString();
    }
    readStringUntil(terminator) {
        const result = [];
        let escaped = false;
        while (this.canRead()) {
            const c = this.read();
            if (escaped) {
                if (c === terminator || c === '\\') {
                    result.push(c);
                    escaped = false;
                }
                else {
                    this.cursor -= 1;
                    throw this.createError(`Invalid escape sequence '${c}' in quoted string`);
                }
            }
            else if (c === '\\') {
                escaped = true;
            }
            else if (c === terminator) {
                return result.join('');
            }
            else {
                result.push(c);
            }
        }
        throw this.createError('Unclosed quoted string');
    }
    readBoolean() {
        const start = this.cursor;
        const value = this.readUnquotedString();
        if (value.length === 0) {
            throw this.createError('Expected bool');
        }
        if (value === 'true') {
            return true;
        }
        else if (value === 'false') {
            return false;
        }
        else {
            this.cursor = start;
            throw this.createError(`Invalid bool, expected true or false but found '${value}'`);
        }
    }
    static isAllowedInNumber(c) {
        return (c >= '0' && c <= '9') || c === '.' || c === '-';
    }
    static isAllowedInUnquotedString(c) {
        return (c >= '0' && c <= '9')
            || (c >= 'A' && c <= 'Z')
            || (c >= 'a' && c <= 'z')
            || c === '_'
            || c === '-'
            || c === '.'
            || c === '+';
    }
    static isQuotedStringStart(c) {
        return c === "'" || c === '"';
    }
    static isWhitespace(c) {
        return c === ' ' || c === '\t' || c === '\n' || c === '\r';
    }
    createError(message) {
        const cursor = Math.min(this.source.length, this.cursor);
        const context = (cursor > 10 ? '...' : '') + this.source.substring(Math.max(0, cursor - 10), cursor);
        return new Error(`${message} at position ${this.cursor}: ${context}<--[HERE]`);
    }
}
//# sourceMappingURL=StringReader.js.map