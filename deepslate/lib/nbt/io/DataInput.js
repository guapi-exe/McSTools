import { decodeUTF8 } from '../Util.js';
export class RawDataInput {
    littleEndian;
    offset;
    array;
    view;
    constructor(input, options) {
        this.littleEndian = options?.littleEndian ?? false;
        this.offset = options?.offset ?? 0;
        this.array = input instanceof Uint8Array ? input : new Uint8Array(input);
        this.view = new DataView(this.array.buffer, this.array.byteOffset);
    }
    readNumber(type, size) {
        const value = this.view[type](this.offset, this.littleEndian);
        this.offset += size;
        return value;
    }
    readByte = this.readNumber.bind(this, 'getInt8', 1);
    readShort = this.readNumber.bind(this, 'getInt16', 2);
    readInt = this.readNumber.bind(this, 'getInt32', 4);
    readFloat = this.readNumber.bind(this, 'getFloat32', 4);
    readDouble = this.readNumber.bind(this, 'getFloat64', 8);
    readBytes(length) {
        const bytes = this.array.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }
    readString() {
        const length = this.readShort();
        const bytes = this.readBytes(length);
        return decodeUTF8(bytes);
    }
}
//# sourceMappingURL=DataInput.js.map