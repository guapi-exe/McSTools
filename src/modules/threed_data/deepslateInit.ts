import {mat4} from 'gl-matrix'

import {
    type ItemRendererResources,
    type Resources,
} from "deepslate";
import {ref} from "vue";
import {loadResource} from "./load_resource.ts";

export let blocks_resources = ref<Resources & ItemRendererResources>()
export interface CameraState {
    xRotation: number
    yRotation: number
    viewDist: number
}
export interface RayData {
    rayOrigin: [number, number, number]
    rayDir: [number, number, number]
}

export class InteractiveCanvas {
    private xRotation = 0.8
    private yRotation = 0.5
    private viewDist = 32
    private canvas: HTMLCanvasElement
    private onBlockHover?: (rayData: RayData | null) => void

    constructor(
        canvas: HTMLCanvasElement,
        camera: CameraState = {xRotation: 0.8, yRotation: 0.5, viewDist: 32},
        private readonly onRender: (view: mat4) => void,
        private readonly center?: [number, number, number],

    ) {
        this.canvas = canvas
        this.xRotation = camera.xRotation
        this.yRotation = camera.yRotation
        this.viewDist = camera.viewDist
        let dragPos: null | [number, number] = null
        
        canvas.addEventListener('mousedown', evt => {
            if (evt.button === 0) {
                dragPos = [evt.clientX, evt.clientY]
            }
        })
        canvas.addEventListener('mousemove', evt => {
            if (dragPos) {
                this.yRotation += (evt.clientX - dragPos[0]) / 100
                this.xRotation += (evt.clientY - dragPos[1]) / 100
                dragPos = [evt.clientX, evt.clientY]
                this.redraw()
            } else {
                if (this.onBlockHover) {
                    const rect = canvas.getBoundingClientRect()
                    const scaleX = canvas.width / rect.width
                    const scaleY = canvas.height / rect.height
                    const x = (evt.clientX - rect.left) * scaleX
                    const y = (evt.clientY - rect.top) * scaleY
                    const rayData = this.screenToRay(x, y)
                    this.onBlockHover(rayData)
                }
            }
        })
        canvas.addEventListener('mouseup', () => {
            dragPos = null
        })
        canvas.addEventListener('mouseleave', () => {
            if (this.onBlockHover) {
                this.onBlockHover(null)
            }
        })
        canvas.addEventListener('wheel', evt => {
            evt.preventDefault()
            this.viewDist += evt.deltaY / 100
            this.redraw()
        })
        this.redraw()
    }

    public setBlockHoverHandler(handler: (rayData: RayData | null) => void) {
        this.onBlockHover = handler
    }

    public getViewMatrix(): mat4 {
        const view = mat4.create()
        mat4.translate(view, view, [0, 0, -this.viewDist])
        mat4.rotate(view, view, this.xRotation, [1, 0, 0])
        mat4.rotate(view, view, this.yRotation, [0, 1, 0])
        if (this.center) {
            mat4.translate(view, view, [-this.center[0], -this.center[1], -this.center[2]])
        }
        return view
    }

    /**
     * 将屏幕坐标转换为射线
     */
    public screenToRay(screenX: number, screenY: number): RayData | null {
        if (!this.center) return null

        const width = this.canvas.width
        const height = this.canvas.height
        const ndcX = (screenX / width) * 2 - 1
        const ndcY = 1 - (screenY / height) * 2
        const aspect = (this.canvas as HTMLCanvasElement).clientWidth / (this.canvas as HTMLCanvasElement).clientHeight
        const fov = 70 * Math.PI / 180
        const near = 0.1
        const far = 500.0
        const proj = mat4.create()
        mat4.perspective(proj, fov, aspect, near, far)
        
        const view = this.getViewMatrix()
        const invProj = mat4.create()
        mat4.invert(invProj, proj)
        const invView = mat4.create()
        mat4.invert(invView, view)
        const nearClip = [ndcX, ndcY, -1, 1]
        const farClip = [ndcX, ndcY, 1, 1]

        const nearView = this.transformVec4(nearClip, invProj)
        const farView = this.transformVec4(farClip, invProj)
        const nearWorld = this.transformVec4([nearView[0], nearView[1], nearView[2], 1], invView)
        const farWorld = this.transformVec4([farView[0], farView[1], farView[2], 1], invView)
        const rayOrigin: [number, number, number] = [nearWorld[0], nearWorld[1], nearWorld[2]]
        const rayDir: [number, number, number] = [
            farWorld[0] - nearWorld[0],
            farWorld[1] - nearWorld[1],
            farWorld[2] - nearWorld[2]
        ]

        const len = Math.sqrt(rayDir[0] ** 2 + rayDir[1] ** 2 + rayDir[2] ** 2)
        if (len > 0) {
            rayDir[0] /= len
            rayDir[1] /= len
            rayDir[2] /= len
        }

        return { rayOrigin, rayDir }
    }

    private transformVec4(v: number[], m: mat4): [number, number, number, number] {
        const out: [number, number, number, number] = [0, 0, 0, 0]
        out[0] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3]
        out[1] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3]
        out[2] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3]
        out[3] = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]
        if (out[3] !== 0) {
            out[0] /= out[3]
            out[1] /= out[3]
            out[2] /= out[3]
            out[3] = 1
        }
        return out
    }

    public redraw() {
        requestAnimationFrame(() => this.renderImmediately())
    }

    private renderImmediately() {
        this.yRotation = this.yRotation % (Math.PI * 2)
        this.xRotation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.xRotation))
        this.viewDist = Math.max(1, this.viewDist)

        const view = mat4.create()
        mat4.translate(view, view, [0, 0, -this.viewDist])
        mat4.rotate(view, view, this.xRotation, [1, 0, 0])
        mat4.rotate(view, view, this.yRotation, [0, 1, 0])
        if (this.center) {
            mat4.translate(view, view, [-this.center[0], -this.center[1], -this.center[2]])
        }
        this.onRender(view)
    }

}

export const resources_Init = async () => {
    await loadResource()
}

