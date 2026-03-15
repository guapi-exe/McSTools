import { Json } from '../util/index.js';
import { NbtFile } from './NbtFile.js';
export class NbtChunk {
    x;
    z;
    compression;
    timestamp;
    raw;
    file;
    dirty;
    constructor(x, z, compression, timestamp, raw) {
        this.x = x;
        this.z = z;
        this.compression = compression;
        this.timestamp = timestamp;
        this.raw = raw;
        this.dirty = false;
    }
    getCompression() {
        switch (this.compression) {
            case 1: return 'gzip';
            case 2: return 'zlib';
            case 3: return 'none';
            default: throw new Error(`Invalid compression mode ${this.compression}`);
        }
    }
    setCompression(compression) {
        switch (compression) {
            case 'gzip':
                this.compression = 1;
                break;
            case 'zlib':
                this.compression = 2;
                break;
            case 'none':
                this.compression = 3;
                break;
            default: throw new Error(`Invalid compression mode ${compression}`);
        }
    }
    getFile() {
        if (this.file === undefined) {
            this.file = NbtFile.read(this.raw, {
                compression: this.getCompression(),
            });
        }
        return this.file;
    }
    getRoot() {
        return this.getFile().root;
    }
    setRoot(root) {
        if (this.file === undefined) {
            this.file = NbtFile.create({
                compression: this.getCompression(),
            });
        }
        this.file.root = root;
        this.markDirty();
    }
    markDirty() {
        this.dirty = true;
    }
    getRaw() {
        if (this.file === undefined || this.dirty === false) {
            return this.raw;
        }
        this.file.compression = this.getCompression();
        const array = this.file.write();
        this.raw = array;
        this.dirty = false;
        return array;
    }
    toJson() {
        return {
            x: this.x,
            z: this.z,
            compression: this.compression,
            timestamp: this.timestamp,
            size: this.raw.byteLength,
        };
    }
    toRef(resolver) {
        return new NbtChunk.Ref(this.x, this.z, this.compression, this.timestamp, this.raw.byteLength, resolver);
    }
    static create(x, z, file, timestamp) {
        const chunk = new NbtChunk(x, z, 0, timestamp ?? 0, file.write());
        chunk.setCompression(file.compression);
        return chunk;
    }
    static fromJson(value, resolver) {
        const obj = Json.readObject(value) ?? {};
        const x = Json.readInt(obj.x) ?? 0;
        const z = Json.readInt(obj.z) ?? 0;
        const compression = Json.readNumber(obj.compression) ?? 2;
        const timestamp = Json.readInt(obj.timestamp) ?? 0;
        const size = Json.readInt(obj.size) ?? 0;
        return new NbtChunk.Ref(x, z, compression, timestamp, size, resolver);
    }
}
(function (NbtChunk) {
    class Ref {
        x;
        z;
        compression;
        timestamp;
        size;
        resolver;
        file;
        constructor(x, z, compression, timestamp, size, resolver) {
            this.x = x;
            this.z = z;
            this.compression = compression;
            this.timestamp = timestamp;
            this.size = size;
            this.resolver = resolver;
        }
        getFile() {
            if (this.file instanceof NbtFile) {
                return this.file;
            }
            return undefined;
        }
        getRoot() {
            if (this.file instanceof NbtFile) {
                return this.file.root;
            }
            return undefined;
        }
        async getFileAsync() {
            if (this.file) {
                return this.file;
            }
            this.file = (async () => {
                const file = await this.resolver(this.x, this.z);
                this.file = file;
                return file;
            })();
            return this.file;
        }
        async getRootAsync() {
            const file = await this.getFileAsync();
            return file.root;
        }
        isResolved() {
            return this.file instanceof NbtFile;
        }
    }
    NbtChunk.Ref = Ref;
})(NbtChunk || (NbtChunk = {}));
//# sourceMappingURL=NbtChunk.js.map