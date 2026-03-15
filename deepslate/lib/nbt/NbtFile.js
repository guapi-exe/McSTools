import Pako from 'pako';
import { Json } from '../util/index.js';
import { getBedrockHeader, hasGzipHeader, hasZlibHeader } from './Util.js';
import { NbtType } from './index.js';
import { RawDataInput, RawDataOutput } from './io/index.js';
import { NbtCompound } from './tags/NbtCompound.js';
export class NbtFile {
    name;
    root;
    compression;
    littleEndian;
    bedrockHeader;
    static DEFAULT_NAME = '';
    static DEFAULT_BEDROCK_HEADER = 4;
    constructor(name, root, compression, littleEndian, bedrockHeader) {
        this.name = name;
        this.root = root;
        this.compression = compression;
        this.littleEndian = littleEndian;
        this.bedrockHeader = bedrockHeader;
    }
    writeNamedTag(output) {
        output.writeByte(NbtType.Compound);
        output.writeString(this.name);
        this.root.toBytes(output);
    }
    write() {
        const littleEndian = this.littleEndian === true || this.bedrockHeader !== undefined;
        const output = new RawDataOutput({ littleEndian, offset: this.bedrockHeader && 8 });
        this.writeNamedTag(output);
        if (this.bedrockHeader !== undefined) {
            const end = output.offset;
            output.offset = 0;
            output.writeInt(this.bedrockHeader);
            output.writeInt(end - 8);
            output.offset = end;
        }
        const array = output.getData();
        if (this.compression === 'gzip') {
            return Pako.gzip(array);
        }
        else if (this.compression === 'zlib') {
            return Pako.deflate(array);
        }
        return array;
    }
    static readNamedTag(input) {
        if (input.readByte() !== NbtType.Compound) {
            throw new Error('Top tag should be a compound');
        }
        return {
            name: input.readString(),
            root: NbtCompound.fromBytes(input),
        };
    }
    static create(options = {}) {
        const name = options.name ?? NbtFile.DEFAULT_NAME;
        const root = NbtCompound.create();
        const compression = options.compression ?? 'none';
        const bedrockHeader = typeof options.bedrockHeader === 'boolean' ? NbtFile.DEFAULT_BEDROCK_HEADER : options.bedrockHeader;
        const littleEndian = options.littleEndian ?? options.bedrockHeader !== undefined;
        return new NbtFile(name, root, compression, littleEndian, bedrockHeader);
    }
    static read(array, options = {}) {
        const bedrockHeader = typeof options.bedrockHeader === 'number' ? options.bedrockHeader : (options.bedrockHeader ? getBedrockHeader(array) : undefined);
        const isGzipCompressed = options.compression === 'gzip' ||
            (!bedrockHeader && options.compression === undefined && hasGzipHeader(array));
        const isZlibCompressed = options.compression === 'zlib' ||
            (!bedrockHeader && options.compression === undefined && hasZlibHeader(array));
        const uncompressedData = (isZlibCompressed || isGzipCompressed) ? Pako.inflate(array) : array;
        const littleEndian = options.littleEndian || bedrockHeader !== undefined;
        const compression = isGzipCompressed ? 'gzip' : isZlibCompressed ? 'zlib' : 'none';
        const input = new RawDataInput(uncompressedData, { littleEndian, offset: bedrockHeader && 8 });
        const { name, root } = NbtFile.readNamedTag(input);
        return new NbtFile(options.name ?? name, root, compression, littleEndian, bedrockHeader);
    }
    toJson() {
        return {
            name: this.name,
            root: this.root.toJson(),
            compression: this.compression,
            littleEndian: this.littleEndian,
            bedrockHeader: this.bedrockHeader ?? null,
        };
    }
    static fromJson(value) {
        const obj = Json.readObject(value) ?? {};
        const name = Json.readString(obj.name) ?? '';
        const root = NbtCompound.fromJson(obj.root ?? {});
        const compression = (Json.readString(obj.compression) ?? 'none');
        const littleEndian = Json.readBoolean(obj.littleEndian) ?? false;
        const bedrockHeader = Json.readNumber(obj.bedrockHeader);
        return new NbtFile(name, root, compression, littleEndian, bedrockHeader);
    }
}
//# sourceMappingURL=NbtFile.js.map