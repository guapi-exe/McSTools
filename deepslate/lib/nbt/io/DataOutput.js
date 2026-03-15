import { encodeUTF8 } from '../Util.js';
export class RawDataOutput {
    littleEndian;
    offset;
    buffer;
    array;
    view;
    constructor(options) {
        this.littleEndian = options?.littleEndian ?? false;
        this.offset = options?.offset ?? 0;
        this.buffer = new ArrayBuffer(options?.initialSize ?? 1024);
        this.array = new Uint8Array(this.buffer);
        this.view = new DataView(this.buffer);
    }
    accommodate(size) {
        const requiredLength = this.offset + size;
        if (this.buffer.byteLength >= requiredLength) {
            return;
        }
        let newLength = this.buffer.byteLength;
        while (newLength < requiredLength) {
            newLength *= 2;
        }
        const newBuffer = new ArrayBuffer(newLength);
        const newArray = new Uint8Array(newBuffer);
        newArray.set(this.array);
        if (this.offset > this.buffer.byteLength) {
            newArray.fill(0, this.buffer.byteLength, this.offset);
        }
        this.buffer = newBuffer;
        this.view = new DataView(newBuffer);
        this.array = newArray;
    }
    writeNumber(type, size, value) {
        this.accommodate(size);
        this.view[type](this.offset, value, this.littleEndian);
        this.offset += size;
    }
    writeByte = this.writeNumber.bind(this, 'setInt8', 1);
    writeShort = this.writeNumber.bind(this, 'setInt16', 2);
    writeInt = this.writeNumber.bind(this, 'setInt32', 4);
    writeFloat = this.writeNumber.bind(this, 'setFloat32', 4);
    writeDouble = this.writeNumber.bind(this, 'setFloat64', 8);
    writeBytes(bytes) {
        this.accommodate(bytes.length);
        this.array.set(bytes, this.offset);
        this.offset += bytes.length;
    }
    writeString(value) {
        const bytes = encodeUTF8(value);
        this.writeShort(bytes.length);
        this.writeBytes(bytes);
    }
    getData() {
        this.accommodate(0);
        return this.array.slice(0, this.offset);
    }
}
//# sourceMappingURL=DataOutput.js.map