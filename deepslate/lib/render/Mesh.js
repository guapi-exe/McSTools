import { Vector } from '../index.js';
import { Line } from './Line.js';
import { Quad } from './Quad.js';
import { Vertex } from './Vertex.js';
export class Mesh {
    quads;
    lines;
    posBuffer;
    colorBuffer;
    textureBuffer;
    textureLimitBuffer;
    normalBuffer;
    blockPosBuffer;
    indexBuffer;
    linePosBuffer;
    lineColorBuffer;
    constructor(quads = [], lines = []) {
        this.quads = quads;
        this.lines = lines;
    }
    clear() {
        this.quads = [];
        this.lines = [];
        return this;
    }
    isEmpty() {
        return this.quads.length === 0 && this.lines.length === 0;
    }
    quadVertices() {
        return this.quads.length * 4;
    }
    quadIndices() {
        return this.quads.length * 6;
    }
    lineVertices() {
        return this.lines.length * 2;
    }
    merge(other) {
        for (const quad of other.quads) {
            this.quads.push(quad);
        }
        for (const line of other.lines) {
            this.lines.push(line);
        }
        return this;
    }
    addLine(x1, y1, z1, x2, y2, z2, color) {
        const line = new Line(Vertex.fromPos(new Vector(x1, y1, z1)), Vertex.fromPos(new Vector(x2, y2, z2))).setColor(color);
        this.lines.push(line);
        return this;
    }
    addLineCube(x1, y1, z1, x2, y2, z2, color) {
        this.addLine(x1, y1, z1, x1, y1, z2, color);
        this.addLine(x2, y1, z1, x2, y1, z2, color);
        this.addLine(x1, y1, z1, x2, y1, z1, color);
        this.addLine(x1, y1, z2, x2, y1, z2, color);
        this.addLine(x1, y1, z1, x1, y2, z1, color);
        this.addLine(x2, y1, z1, x2, y2, z1, color);
        this.addLine(x1, y1, z2, x1, y2, z2, color);
        this.addLine(x2, y1, z2, x2, y2, z2, color);
        this.addLine(x1, y2, z1, x1, y2, z2, color);
        this.addLine(x2, y2, z1, x2, y2, z2, color);
        this.addLine(x1, y2, z1, x2, y2, z1, color);
        this.addLine(x1, y2, z2, x2, y2, z2, color);
        return this;
    }
    transform(transformation) {
        for (const quad of this.quads) {
            quad.transform(transformation);
        }
        for (const line of this.lines) {
            line.transform(transformation);
        }
        return this;
    }
    mergeTranslated(other, x, y, z, blockPos) {
        const cloneVertex = (vertex) => new Vertex(new Vector(vertex.pos.x + x, vertex.pos.y + y, vertex.pos.z + z), vertex.color, vertex.texture, vertex.textureLimit, vertex.normal, blockPos ?? vertex.blockPos);
        for (const quad of other.quads) {
            this.quads.push(new Quad(cloneVertex(quad.v1), cloneVertex(quad.v2), cloneVertex(quad.v3), cloneVertex(quad.v4)));
        }
        for (const line of other.lines) {
            this.lines.push(new Line(cloneVertex(line.v1), cloneVertex(line.v2)));
        }
        return this;
    }
    translate(x, y, z) {
        for (const quad of this.quads) {
            quad.translate(x, y, z);
        }
        for (const line of this.lines) {
            line.translate(x, y, z);
        }
        return this;
    }
    computeNormals() {
        for (const quad of this.quads) {
            const normal = quad.normal();
            quad.forEach(v => v.normal = normal);
        }
    }
    rebuild(gl, options) {
        const rebuildBuffer = (buffer, type, data) => {
            if (!buffer) {
                buffer = gl.createBuffer() ?? undefined;
            }
            if (!buffer) {
                throw new Error('Cannot create new buffer');
            }
            gl.bindBuffer(type, buffer);
            gl.bufferData(type, data, gl.STATIC_DRAW);
            return buffer;
        };
        const writeQuadVertices = (quad, data, index, size, mapper) => {
            mapper(quad.v1, data, index);
            index += size;
            mapper(quad.v2, data, index);
            index += size;
            mapper(quad.v3, data, index);
            index += size;
            mapper(quad.v4, data, index);
            return index + size;
        };
        const writeLineVertices = (line, data, index, size, mapper) => {
            mapper(line.v1, data, index);
            index += size;
            mapper(line.v2, data, index);
            return index + size;
        };
        const rebuildQuadBuffer = (buffer, size, mapper) => {
            const quadCount = this.quads.length;
            if (quadCount === 0) {
                if (buffer)
                    gl.deleteBuffer(buffer);
                return undefined;
            }
            const data = new Float32Array(quadCount * 4 * size);
            let index = 0;
            for (const quad of this.quads) {
                index = writeQuadVertices(quad, data, index, size, mapper);
            }
            return rebuildBuffer(buffer, gl.ARRAY_BUFFER, data);
        };
        const rebuildLineBuffer = (buffer, size, mapper) => {
            const lineCount = this.lines.length;
            if (lineCount === 0) {
                if (buffer)
                    gl.deleteBuffer(buffer);
                return undefined;
            }
            const data = new Float32Array(lineCount * 2 * size);
            let index = 0;
            for (const line of this.lines) {
                index = writeLineVertices(line, data, index, size, mapper);
            }
            return rebuildBuffer(buffer, gl.ARRAY_BUFFER, data);
        };
        if (options.pos) {
            this.posBuffer = rebuildQuadBuffer(this.posBuffer, 3, (v, data, i) => {
                data[i] = v.pos.x;
                data[i + 1] = v.pos.y;
                data[i + 2] = v.pos.z;
            });
            this.linePosBuffer = rebuildLineBuffer(this.linePosBuffer, 3, (v, data, i) => {
                data[i] = v.pos.x;
                data[i + 1] = v.pos.y;
                data[i + 2] = v.pos.z;
            });
        }
        if (options.color) {
            this.colorBuffer = rebuildQuadBuffer(this.colorBuffer, 3, (v, data, i) => {
                data[i] = v.color[0];
                data[i + 1] = v.color[1];
                data[i + 2] = v.color[2];
            });
            this.lineColorBuffer = rebuildLineBuffer(this.lineColorBuffer, 3, (v, data, i) => {
                data[i] = v.color[0];
                data[i + 1] = v.color[1];
                data[i + 2] = v.color[2];
            });
        }
        if (options.texture) {
            this.textureBuffer = rebuildQuadBuffer(this.textureBuffer, 2, (v, data, i) => {
                if (!v.texture)
                    throw new Error('Missing vertex component');
                data[i] = v.texture[0];
                data[i + 1] = v.texture[1];
            });
            this.textureLimitBuffer = rebuildQuadBuffer(this.textureLimitBuffer, 4, (v, data, i) => {
                if (!v.textureLimit)
                    throw new Error('Missing vertex component');
                data[i] = v.textureLimit[0];
                data[i + 1] = v.textureLimit[1];
                data[i + 2] = v.textureLimit[2];
                data[i + 3] = v.textureLimit[3];
            });
        }
        if (options.normal) {
            this.normalBuffer = rebuildQuadBuffer(this.normalBuffer, 3, (v, data, i) => {
                if (!v.normal)
                    throw new Error('Missing vertex component');
                data[i] = v.normal.x;
                data[i + 1] = v.normal.y;
                data[i + 2] = v.normal.z;
            });
        }
        if (options.blockPos) {
            this.blockPosBuffer = rebuildQuadBuffer(this.blockPosBuffer, 3, (v, data, i) => {
                if (!v.blockPos)
                    throw new Error('Missing vertex component');
                data[i] = v.blockPos.x;
                data[i + 1] = v.blockPos.y;
                data[i + 2] = v.blockPos.z;
            });
        }
        if (this.quads.length === 0) {
            if (this.indexBuffer)
                gl.deleteBuffer(this.indexBuffer);
            this.indexBuffer = undefined;
        }
        else {
            const indices = new Uint16Array(this.quads.length * 6);
            let index = 0;
            for (let i = 0; i < this.quads.length; i += 1) {
                const base = i * 4;
                indices[index] = base;
                indices[index + 1] = base + 1;
                indices[index + 2] = base + 2;
                indices[index + 3] = base;
                indices[index + 4] = base + 2;
                indices[index + 5] = base + 3;
                index += 6;
            }
            this.indexBuffer = rebuildBuffer(this.indexBuffer, gl.ELEMENT_ARRAY_BUFFER, indices);
        }
        return this;
    }
}
//# sourceMappingURL=Mesh.js.map