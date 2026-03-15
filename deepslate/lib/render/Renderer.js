import { mat4 } from 'gl-matrix';
import { ShaderProgram } from './ShaderProgram.js';
const vsSource = `
  attribute vec4 vertPos;
  attribute vec2 texCoord;
  attribute vec4 texLimit;
  attribute vec3 vertColor;
  attribute vec3 normal;

  uniform mat4 mView;
  uniform mat4 mProj;

  varying highp vec2 vTexCoord;
  varying highp vec4 vTexLimit;
  varying highp vec3 vTintColor;
  varying highp float vLighting;

  void main(void) {
    gl_Position = mProj * mView * vertPos;
    vTexCoord = texCoord;
	vTexLimit = texLimit;
    vTintColor = vertColor;
    vLighting = normal.y * 0.2 + abs(normal.z) * 0.1 + 0.8;
  }
`;
const fsSource = `
  precision highp float;
  varying highp vec2 vTexCoord;
  varying highp vec4 vTexLimit;
  varying highp vec3 vTintColor;
  varying highp float vLighting;

  uniform sampler2D sampler;
  uniform highp float pixelSize;

  void main(void) {
		vec4 texColor = texture2D(sampler, clamp(vTexCoord,
			vTexLimit.xy + vec2(0.5, 0.5) * pixelSize,
			vTexLimit.zw - vec2(0.5, 0.5) * pixelSize
		));
		if(texColor.a < 0.01) discard;
		gl_FragColor = vec4(texColor.xyz * vTintColor * vLighting, texColor.a);
  }
`;
export class Renderer {
    gl;
    shaderProgram;
    projMatrix;
    activeShader;
    boundShader = null;
    pixelSize = 0;
    uniformLocations = new WeakMap();
    attributeLocations = new WeakMap();
    enabledAttributes = new Set();
    attributeBindingState = new Map();
    currentArrayBuffer = null;
    currentElementArrayBuffer = null;
    constructor(gl) {
        this.gl = gl;
        this.shaderProgram = new ShaderProgram(gl, vsSource, fsSource).getProgram();
        this.activeShader = this.shaderProgram;
        this.projMatrix = this.getPerspective();
        this.initialize();
    }
    setViewport(x, y, width, height) {
        this.gl.viewport(x, y, width, height);
        this.projMatrix = this.getPerspective();
    }
    getPerspective() {
        const fieldOfView = 70 * Math.PI / 180;
        const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
        const projMatrix = mat4.create();
        mat4.perspective(projMatrix, fieldOfView, aspect, 0.1, 500.0);
        return projMatrix;
    }
    initialize() {
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
    }
    setShader(shader) {
        this.activeShader = shader;
        const currentProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
        if (this.boundShader === shader && currentProgram === shader)
            return;
        this.gl.useProgram(shader);
        this.boundShader = shader;
        this.enabledAttributes.clear();
        this.attributeBindingState.clear();
    }
    getUniformLocation(name) {
        let shaderLocations = this.uniformLocations.get(this.activeShader);
        if (!shaderLocations) {
            shaderLocations = new Map();
            this.uniformLocations.set(this.activeShader, shaderLocations);
        }
        if (!shaderLocations.has(name)) {
            shaderLocations.set(name, this.gl.getUniformLocation(this.activeShader, name));
        }
        return shaderLocations.get(name) ?? null;
    }
    getAttributeLocation(name) {
        let shaderLocations = this.attributeLocations.get(this.activeShader);
        if (!shaderLocations) {
            shaderLocations = new Map();
            this.attributeLocations.set(this.activeShader, shaderLocations);
        }
        if (!shaderLocations.has(name)) {
            shaderLocations.set(name, this.gl.getAttribLocation(this.activeShader, name));
        }
        return shaderLocations.get(name) ?? -1;
    }
    setVertexAttr(name, size, buffer) {
        if (buffer === undefined)
            throw new Error(`Expected buffer for ${name}`);
        const location = this.getAttributeLocation(name);
        if (location < 0)
            return;
        if (this.currentArrayBuffer !== buffer) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.currentArrayBuffer = buffer;
        }
        const existing = this.attributeBindingState.get(location);
        if (!existing || existing.buffer !== buffer || existing.size !== size) {
            this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, 0, 0);
            this.attributeBindingState.set(location, { buffer, size });
        }
        if (!this.enabledAttributes.has(location)) {
            this.gl.enableVertexAttribArray(location);
            this.enabledAttributes.add(location);
        }
    }
    setUniform(name, value) {
        const location = this.getUniformLocation(name);
        if (location === null)
            return;
        this.gl.uniformMatrix4fv(location, false, value);
    }
    setTexture(texture, pixelSize) {
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.pixelSize = pixelSize ?? 0;
    }
    createAtlasTexture(image, options) {
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
        const mipmaps = options?.mipmaps ?? false;
        if (mipmaps) {
            this.gl.generateMipmap(this.gl.TEXTURE_2D);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST_MIPMAP_NEAREST);
        }
        else {
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        }
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        return texture;
    }
    prepareDraw(viewMatrix) {
        this.setUniform('mView', viewMatrix);
        this.setUniform('mProj', this.projMatrix);
        if (this.activeShader !== this.shaderProgram)
            return;
        const location = this.getUniformLocation('pixelSize');
        if (location === null)
            return;
        this.gl.uniform1f(location, this.pixelSize);
    }
    drawMesh(mesh, options) {
        if (mesh.quadVertices() > 0) {
            if (options.pos)
                this.setVertexAttr('vertPos', 3, mesh.posBuffer);
            if (options.color)
                this.setVertexAttr('vertColor', 3, mesh.colorBuffer);
            if (options.texture) {
                this.setVertexAttr('texCoord', 2, mesh.textureBuffer);
                this.setVertexAttr('texLimit', 4, mesh.textureLimitBuffer);
            }
            if (options.normal)
                this.setVertexAttr('normal', 3, mesh.normalBuffer);
            if (options.blockPos)
                this.setVertexAttr('blockPos', 3, mesh.blockPosBuffer);
            if (!mesh.indexBuffer)
                throw new Error('Expected index buffer');
            if (this.currentElementArrayBuffer !== mesh.indexBuffer) {
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
                this.currentElementArrayBuffer = mesh.indexBuffer;
            }
            this.gl.drawElements(this.gl.TRIANGLES, mesh.quadIndices(), this.gl.UNSIGNED_SHORT, 0);
        }
        if (mesh.lineVertices() > 0) {
            if (options.pos)
                this.setVertexAttr('vertPos', 3, mesh.linePosBuffer);
            if (options.color)
                this.setVertexAttr('vertColor', 3, mesh.lineColorBuffer);
            this.gl.drawArrays(this.gl.LINES, 0, mesh.lineVertices());
        }
    }
}
//# sourceMappingURL=Renderer.js.map