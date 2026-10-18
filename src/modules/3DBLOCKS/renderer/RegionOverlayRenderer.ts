import {mat4} from 'gl-matrix'
import type {GLContext, Vec3} from '../types'
import {ShaderProgram} from './ShaderProgram'

// Constant-size geometry: selecting a million-block region costs the same as
// selecting one block. Do not materialize every selected voxel for the overlay.
export class RegionOverlayRenderer {
  private readonly shader: ShaderProgram
  private readonly buffer: WebGLBuffer
  private readonly transform = mat4.create()
  private readonly position: number
  private readonly view: WebGLUniformLocation | null
  private readonly projection: WebGLUniformLocation | null
  private readonly color: WebGLUniformLocation | null
  constructor(private readonly gl: GLContext) {
    this.shader = new ShaderProgram(gl, `attribute vec3 aPosition; uniform mat4 uView; uniform mat4 uProj;
      void main() { gl_Position = uProj * uView * vec4(aPosition, 1.0); }`,
      `precision highp float; uniform vec4 uColor; void main() { gl_FragColor = uColor; }`)
    this.position = this.shader.attrib('aPosition')
    this.view = this.shader.uniform('uView'); this.projection = this.shader.uniform('uProj'); this.color = this.shader.uniform('uColor')
    const buffer = gl.createBuffer()
    if (!buffer) throw new Error('Could not allocate region overlay')
    this.buffer = buffer
    const vertices: number[] = []
    for (let axis = 0; axis < 3; axis++) for (const a of [0, 1]) for (const b of [0, 1]) {
      const from: Vec3 = [0, 0, 0]; const to: Vec3 = [0, 0, 0]
      from[(axis + 1) % 3] = to[(axis + 1) % 3] = a
      from[(axis + 2) % 3] = to[(axis + 2) % 3] = b
      to[axis] = 1; vertices.push(...from, ...to)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)
  }
  draw(view: mat4, projection: mat4, min: Vec3, max: Vec3, color: Vec3) {
    const gl = this.gl
    const depth = gl.isEnabled(gl.DEPTH_TEST)
    const depthWrite = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean
    const width = gl.getParameter(gl.LINE_WIDTH) as number
    this.shader.use()
    mat4.copy(this.transform, view); mat4.translate(this.transform, this.transform, min)
    mat4.scale(this.transform, this.transform, max.map((n, a) => n - min[a]) as Vec3)
    gl.uniformMatrix4fv(this.view, false, this.transform); gl.uniformMatrix4fv(this.projection, false, projection)
    gl.uniform4f(this.color, color[0], color[1], color[2], 1)
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.lineWidth(1)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.enableVertexAttribArray(this.position); gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.LINES, 0, 24)
    gl.depthMask(depthWrite); gl.lineWidth(width)
    if (depth) gl.enable(gl.DEPTH_TEST)
  }
  dispose() { this.gl.deleteBuffer(this.buffer); this.shader.dispose() }
}
