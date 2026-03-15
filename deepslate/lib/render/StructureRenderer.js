import { mat4 } from 'gl-matrix';
import { BlockState } from '../core/index.js';
import { ChunkBuilder } from './ChunkBuilder.js';
import { Mesh } from './Mesh.js';
import { Renderer } from './Renderer.js';
import { ShaderProgram } from './ShaderProgram.js';
const vsColor = `
  attribute vec4 vertPos;
  attribute vec3 blockPos;

  uniform mat4 mView;
  uniform mat4 mProj;

  varying highp vec3 vColor;

  void main(void) {
    gl_Position = mProj * mView * vertPos;
    vColor = blockPos / 256.0;
  }
`;
const fsColor = `
  precision highp float;
  varying highp vec3 vColor;

  void main(void) {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;
const vsGrid = `
  attribute vec4 vertPos;
  attribute vec3 vertColor;

  uniform mat4 mView;
  uniform mat4 mProj;

  varying highp vec3 vColor;

  void main(void) {
    gl_Position = mProj * mView * vertPos;
    vColor = vertColor;
  }
`;
const fsGrid = `
  precision highp float;
  varying highp vec3 vColor;

  void main(void) {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;
export class StructureRenderer extends Renderer {
    structure;
    resources;
    gridShaderProgram;
    colorShaderProgram;
    translatedMatrix = mat4.create();
    gridMesh = new Mesh();
    outlineMeshCache = new Map();
    invisibleBlocksMesh = new Mesh();
    atlasTexture;
    useInvisibleBlocks;
    hasBlockPosBuffer;
    versionTag;
    skipNextFullUpdate = false;
    effectiveChunkSize;
    chunkBuilder;
    static getAdaptiveChunkSize(structure) {
        const [x, y, z] = structure.getSize();
        const volume = x * y * z;
        if (volume >= 256 * 256 * 128)
            return 32;
        if (volume >= 128 * 128 * 96)
            return 24;
        return 16;
    }
    constructor(gl, structure, resources, options) {
        super(gl);
        this.structure = structure;
        this.resources = resources;
        const buildStartTime = StructureRenderer.now();
        const chunkSize = options?.chunkSize ?? StructureRenderer.getAdaptiveChunkSize(structure);
        this.effectiveChunkSize = chunkSize;
        this.chunkBuilder = new ChunkBuilder(gl, structure, resources, chunkSize);
        if (options?.facesPerBuffer) {
            console.warn('[deepslate renderer warning]: facesPerBuffer option has been removed in favor of chunkSize');
        }
        this.versionTag = options?.versionTag ?? 'deepslate@unknown';
        this.useInvisibleBlocks = options?.useInvisibleBlockBuffer ?? false;
        this.hasBlockPosBuffer = options?.includeBlockPosBuffer ?? false;
        this.chunkBuilder.setIncludeBlockPosBuffer(this.hasBlockPosBuffer);
        this.gridShaderProgram = new ShaderProgram(gl, vsGrid, fsGrid).getProgram();
        this.colorShaderProgram = new ShaderProgram(gl, vsColor, fsColor).getProgram();
        this.gridMesh = this.getGridMesh();
        this.outlineMeshCache.set('1,1,1', this.getOutlineMesh());
        this.invisibleBlocksMesh = this.getInvisibleBlocksMesh();
        this.atlasTexture = this.createAtlasTexture(this.resources.getTextureAtlas(), { mipmaps: options?.atlasMipmaps ?? false });
        this.logRenderSummary('initial-build', StructureRenderer.now() - buildStartTime);
    }
    getChunkSize() {
        return this.effectiveChunkSize;
    }
    static now() {
        return typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
    }
    logRenderSummary(stage, elapsedMs) {
        const [x, y, z] = this.structure.getSize();
        const stats = this.chunkBuilder.getStats();
        console.info(`[deepslate renderer] ${stage} | version=${this.versionTag} | size=${x}x${y}x${z} | chunks=${stats.chunkCount} | meshes=${stats.meshCount} | triangles=${stats.triangleCount} | buildMs=${elapsedMs.toFixed(2)}`);
    }
    setStructure(structure) {
        const startTime = StructureRenderer.now();
        this.structure = structure;
        this.chunkBuilder.setStructure(structure);
        this.gridMesh = this.getGridMesh();
        this.invisibleBlocksMesh = this.getInvisibleBlocksMesh();
        this.skipNextFullUpdate = true;
        this.logRenderSummary('set-structure', StructureRenderer.now() - startTime);
    }
    updateStructureBuffers(chunkPositions) {
        if (!chunkPositions && this.skipNextFullUpdate) {
            this.skipNextFullUpdate = false;
            return;
        }
        const startTime = StructureRenderer.now();
        this.chunkBuilder.updateStructureBuffers(chunkPositions);
        this.logRenderSummary('update-sync', StructureRenderer.now() - startTime);
    }
    async updateStructureBuffersAsync(chunkPositions, blocksPerSlice = 4000) {
        if (!chunkPositions && this.skipNextFullUpdate) {
            this.skipNextFullUpdate = false;
            return;
        }
        const startTime = StructureRenderer.now();
        await this.chunkBuilder.updateStructureBuffersAsync(chunkPositions, blocksPerSlice);
        this.logRenderSummary('update-async', StructureRenderer.now() - startTime);
    }
    getGridMesh() {
        const [X, Y, Z] = this.structure.getSize();
        const mesh = new Mesh();
        mesh.addLine(0, 0, 0, X, 0, 0, [1, 0, 0]);
        mesh.addLine(0, 0, 0, 0, 0, Z, [0, 0, 1]);
        const c = [0.8, 0.8, 0.8];
        mesh.addLine(0, 0, 0, 0, Y, 0, c);
        mesh.addLine(X, 0, 0, X, Y, 0, c);
        mesh.addLine(0, 0, Z, 0, Y, Z, c);
        mesh.addLine(X, 0, Z, X, Y, Z, c);
        mesh.addLine(0, Y, 0, 0, Y, Z, c);
        mesh.addLine(X, Y, 0, X, Y, Z, c);
        mesh.addLine(0, Y, 0, X, Y, 0, c);
        mesh.addLine(0, Y, Z, X, Y, Z, c);
        for (let x = 1; x <= X; x += 1)
            mesh.addLine(x, 0, 0, x, 0, Z, c);
        for (let z = 1; z <= Z; z += 1)
            mesh.addLine(0, 0, z, X, 0, z, c);
        return mesh.rebuild(this.gl, { pos: true, color: true });
    }
    getOutlineMesh(color = [1, 1, 1]) {
        return new Mesh()
            .addLineCube(0, 0, 0, 1, 1, 1, color)
            .rebuild(this.gl, { pos: true, color: true });
    }
    getCachedOutlineMesh(color) {
        const key = `${color[0]},${color[1]},${color[2]}`;
        const cached = this.outlineMeshCache.get(key);
        if (cached)
            return cached;
        const mesh = this.getOutlineMesh(color);
        this.outlineMeshCache.set(key, mesh);
        return mesh;
    }
    getInvisibleBlocksMesh() {
        const mesh = new Mesh();
        if (!this.useInvisibleBlocks) {
            return mesh;
        }
        const size = this.structure.getSize();
        const volume = size[0] * size[1] * size[2];
        if (volume > 512 * 512) {
            console.warn('[deepslate renderer warning]: invisible block buffer skipped for large structure');
            return mesh;
        }
        for (let x = 0; x < size[0]; x += 1) {
            for (let y = 0; y < size[1]; y += 1) {
                for (let z = 0; z < size[2]; z += 1) {
                    const block = this.structure.getBlock([x, y, z]);
                    if (block === undefined)
                        continue;
                    if (block === null) {
                        mesh.addLineCube(x + 0.4375, y + 0.4375, z + 0.4375, x + 0.5625, y + 0.5625, z + 0.5625, [1, 0.25, 0.25]);
                    }
                    else if (block.state.is(BlockState.AIR)) {
                        mesh.addLineCube(x + 0.375, y + 0.375, z + 0.375, x + 0.625, y + 0.625, z + 0.625, [0.5, 0.5, 1]);
                    }
                    else if (block.state.is(new BlockState('cave_air'))) {
                        mesh.addLineCube(x + 0.375, y + 0.375, z + 0.375, x + 0.625, y + 0.625, z + 0.625, [0.5, 1, 0.5]);
                    }
                }
            }
        }
        return mesh.rebuild(this.gl, { pos: true, color: true });
    }
    drawGrid(viewMatrix) {
        this.setShader(this.gridShaderProgram);
        this.prepareDraw(viewMatrix);
        this.drawMesh(this.gridMesh, { pos: true, color: true });
    }
    drawInvisibleBlocks(viewMatrix) {
        if (!this.useInvisibleBlocks) {
            return;
        }
        this.setShader(this.gridShaderProgram);
        this.prepareDraw(viewMatrix);
        this.drawMesh(this.invisibleBlocksMesh, { pos: true, color: true });
    }
    drawStructure(viewMatrix) {
        this.setShader(this.shaderProgram);
        this.setTexture(this.atlasTexture, this.resources.getPixelSize?.());
        this.prepareDraw(viewMatrix);
        this.chunkBuilder.getMeshes().forEach(mesh => {
            this.drawMesh(mesh, { pos: true, color: true, texture: true, normal: true });
        });
    }
    drawColoredStructure(viewMatrix) {
        if (!this.hasBlockPosBuffer) {
            this.hasBlockPosBuffer = true;
            this.chunkBuilder.setIncludeBlockPosBuffer(true);
        }
        this.setShader(this.colorShaderProgram);
        this.prepareDraw(viewMatrix);
        this.chunkBuilder.getMeshes().forEach(mesh => {
            this.drawMesh(mesh, { pos: true, color: true, normal: true, blockPos: true });
        });
    }
    drawOutline(viewMatrix, pos, color = [1, 1, 1]) {
        const outlineMesh = this.getCachedOutlineMesh(color);
        this.setShader(this.gridShaderProgram);
        mat4.copy(this.translatedMatrix, viewMatrix);
        mat4.translate(this.translatedMatrix, this.translatedMatrix, pos);
        this.prepareDraw(this.translatedMatrix);
        this.drawMesh(outlineMesh, { pos: true, color: true });
    }
}
//# sourceMappingURL=StructureRenderer.js.map