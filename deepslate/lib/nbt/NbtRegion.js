import { Json } from '../util/index.js';
import { NbtChunk } from './NbtChunk.js';
class NbtAbstractRegion {
    chunks;
    constructor(chunks) {
        this.chunks = Array(32 * 32).fill(undefined);
        for (const chunk of chunks) {
            const index = NbtRegion.getIndex(chunk.x, chunk.z);
            this.chunks[index] = chunk;
        }
    }
    getChunkPositions() {
        return this.chunks.flatMap(c => c ? [[c.x, c.z]] : []);
    }
    getChunk(index) {
        if (index < 0 || index >= 32 * 32) {
            return undefined;
        }
        return this.chunks[index];
    }
    findChunk(x, z) {
        return this.getChunk(NbtRegion.getIndex(x, z));
    }
    getFirstChunk() {
        return this.chunks.filter(c => c !== undefined)[0];
    }
    filter(predicate) {
        return this.chunks.filter((c) => c !== undefined && predicate(c));
    }
    map(mapper) {
        return this.chunks.flatMap(c => c !== undefined ? [mapper(c)] : []);
    }
}
export class NbtRegion extends NbtAbstractRegion {
    constructor(chunks) {
        super(chunks);
    }
    write() {
        let totalSectors = 0;
        for (const chunk of this.chunks) {
            if (chunk === undefined)
                continue;
            totalSectors += Math.ceil(chunk.getRaw().length / 4096);
        }
        const array = new Uint8Array(8192 + totalSectors * 4096);
        const dataView = new DataView(array.buffer);
        let offset = 2;
        for (const chunk of this.chunks) {
            if (chunk === undefined)
                continue;
            const chunkData = chunk.getRaw();
            const i = 4 * ((chunk.x & 31) + (chunk.z & 31) * 32);
            const sectors = Math.ceil(chunkData.length / 4096);
            dataView.setInt8(i, offset >> 16);
            dataView.setInt16(i + 1, offset & 0xffff);
            dataView.setInt8(i + 3, sectors);
            dataView.setInt32(i + 4096, chunk.timestamp);
            const j = offset * 4096;
            dataView.setInt32(j, chunkData.length + 1);
            dataView.setInt8(j + 4, chunk.compression);
            array.set(chunkData, j + 5);
            offset += sectors;
        }
        return array;
    }
    static read(array) {
        const chunks = [];
        for (let x = 0; x < 32; x += 1) {
            for (let z = 0; z < 32; z += 1) {
                const i = 4 * ((x & 31) + (z & 31) * 32);
                const sectors = array[i + 3];
                if (sectors === 0)
                    continue;
                const offset = (array[i] << 16) + (array[i + 1] << 8) + array[i + 2];
                const timestamp = (array[i + 4096] << 24) + (array[i + 4097] << 16) + (array[i + 4098] << 8) + array[i + 4099];
                const j = offset * 4096;
                const length = (array[j] << 24) + (array[j + 1] << 16) + (array[j + 2] << 8) + array[j + 3];
                const compression = array[j + 4];
                const data = array.slice(j + 5, j + 4 + length);
                chunks.push(new NbtChunk(x, z, compression, timestamp, data));
            }
        }
        return new NbtRegion(chunks);
    }
    static getIndex(x, z) {
        return (x & 31) + (z & 31) * 32;
    }
    toJson() {
        return {
            chunks: this.map(c => c.toJson()),
        };
    }
    static fromJson(value, chunkResolver) {
        const obj = Json.readObject(value) ?? {};
        const chunks = Json.readArray(obj.chunks) ?? [];
        const chunks2 = chunks.flatMap(c => c !== undefined ? [NbtChunk.fromJson(c, chunkResolver)] : []);
        return new NbtRegion.Ref(chunks2);
    }
}
(function (NbtRegion) {
    class Ref extends NbtAbstractRegion {
    }
    NbtRegion.Ref = Ref;
})(NbtRegion || (NbtRegion = {}));
//# sourceMappingURL=NbtRegion.js.map