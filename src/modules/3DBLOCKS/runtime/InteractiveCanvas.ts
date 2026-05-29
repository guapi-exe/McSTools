import {mat4} from 'gl-matrix'
export interface CameraState {
    xRotation: number
    yRotation: number
    viewDist: number
    position?: [number, number, number]
}
export interface RayData {
    rayOrigin: [number, number, number]
    rayDir: [number, number, number]
}

export class InteractiveCanvas {
    private xRotation = 0.8
    private yRotation = 0.5
    private viewDist = 32
    private cameraPosition: [number, number, number] = [0, 0, 0]
    private canvas: HTMLCanvasElement
    private onBlockHover?: (rayData: RayData | null) => void
    private keysPressed: Set<string> = new Set()
    private isAnimating = false
    private disposed = false
    private framePending = false
    private hoverFramePending = false
    private pendingHoverPoint: [number, number] | null = null
    private hoverPausedUntil = 0
    private readonly events = new AbortController()
    private lastAnimationTime = 0
    private middleDrag: { startX: number, startY: number, startCamera: [number, number, number] } | null = null

    constructor(
        canvas: HTMLCanvasElement,
        camera: CameraState = {xRotation: 0.8, yRotation: 0.5, viewDist: 32},
        private readonly onRender: (view: mat4) => void,
        private center?: [number, number, number],

    ) {
        const instance = this
        this.canvas = canvas
        this.xRotation = camera.xRotation
        this.yRotation = camera.yRotation
        this.viewDist = camera.viewDist
        this.center = this.center || [0, 0, 0]
        this.cameraPosition = camera.position
            ? [...camera.position]
            : this.getOrbitCameraPosition(this.center, this.viewDist, this.xRotation, this.yRotation)
        let dragPos: null | [number, number] = null
        
        canvas.addEventListener('mousedown', evt => {
            this.pauseHover()
            if (evt.button === 0) {
                dragPos = [evt.clientX, evt.clientY]
            } else if (evt.button === 1 || evt.button === 2) {
                this.middleDrag = { startX: evt.clientX, startY: evt.clientY, startCamera: [...this.cameraPosition] }
            }
        }, { signal: this.events.signal })
        canvas.addEventListener('contextmenu', evt => evt.preventDefault(), { signal: this.events.signal })
        canvas.addEventListener('mousemove', evt => {
            if (dragPos) {
                this.yRotation += (evt.clientX - dragPos[0]) / 100
                this.xRotation += (evt.clientY - dragPos[1]) / 100
                dragPos = [evt.clientX, evt.clientY]
                this.redraw()
            } else if (this.middleDrag) {
                const deltaX = evt.clientX - this.middleDrag.startX
                const deltaY = evt.clientY - this.middleDrag.startY
                const sensitivity = Math.max(0.004, this.viewDist * 0.00035)
                const right = this.getWorldDirection([1, 0, 0])
                const up = this.getWorldDirection([0, 1, 0])
                this.cameraPosition[0] = this.middleDrag.startCamera[0]
                    - right[0] * deltaX * sensitivity
                    + up[0] * deltaY * sensitivity
                this.cameraPosition[1] = this.middleDrag.startCamera[1]
                    - right[1] * deltaX * sensitivity
                    + up[1] * deltaY * sensitivity
                this.cameraPosition[2] = this.middleDrag.startCamera[2]
                    - right[2] * deltaX * sensitivity
                    + up[2] * deltaY * sensitivity
                this.redraw()
            } else {
                if (instance.onBlockHover) {
                    instance.scheduleHover(evt.clientX, evt.clientY)
                }
            }
        }, { signal: this.events.signal })
        canvas.addEventListener('mouseup', () => {
            dragPos = null
            this.middleDrag = null
            this.pauseHover(80)
        }, { signal: this.events.signal })
        canvas.addEventListener('mouseleave', () => {
            if (instance.onBlockHover) {
                instance.pendingHoverPoint = null
                instance.onBlockHover(null)
            }
        }, { signal: this.events.signal })
        canvas.addEventListener('wheel', evt => {
            evt.preventDefault()
            this.pauseHover(120)
            const forward = this.getWorldDirection([0, 0, -1])
            const step = -evt.deltaY * Math.max(0.004, this.viewDist * 0.00018)
            this.translateCamera(forward, step)
            this.viewDist = Math.max(1, this.viewDist + evt.deltaY * 0.02)
            this.redraw()
        }, { signal: this.events.signal, passive: false })
        this.redraw()

        window.addEventListener('keydown', (evt) => {
            if (this.shouldIgnoreKeyboardEvent(evt)) return
            const key = evt.key.toLowerCase()
            const handled = this.isHandledNavigationKey(key)
            const modifier = key === 'shift' || key === 'control'
            if (!handled && !modifier) return
            if (handled) {
                evt.preventDefault()
            }
            this.keysPressed.add(key)
            if (handled) this.pauseHover(120)
            if (handled && !this.isAnimating) {
                this.animate()
            }
        }, { signal: this.events.signal })

        window.addEventListener('keyup', (evt) => {
            this.keysPressed.delete(evt.key.toLowerCase())
        }, { signal: this.events.signal })
        window.addEventListener('blur', () => {
            this.keysPressed.clear()
            this.isAnimating = false
        }, { signal: this.events.signal })
    }

    public setBlockHoverHandler(handler: (rayData: RayData | null) => void) {
        this.onBlockHover = handler
    }

    private pauseHover(ms = 100) {
        this.hoverPausedUntil = performance.now() + ms
        this.pendingHoverPoint = null
        this.onBlockHover?.(null)
    }

    private scheduleHover(clientX: number, clientY: number) {
        if (performance.now() < this.hoverPausedUntil) return
        this.pendingHoverPoint = [clientX, clientY]
        if (this.hoverFramePending) return
        this.hoverFramePending = true
        requestAnimationFrame(() => {
            this.hoverFramePending = false
            const point = this.pendingHoverPoint
            this.pendingHoverPoint = null
            if (!point || this.disposed || performance.now() < this.hoverPausedUntil) return

            const rect = this.canvas.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return
            const scaleX = this.canvas.width / rect.width
            const scaleY = this.canvas.height / rect.height
            const x = (point[0] - rect.left) * scaleX
            const y = (point[1] - rect.top) * scaleY
            this.onBlockHover?.(this.screenToRay(x, y))
        })
    }

    private shouldIgnoreKeyboardEvent(evt: KeyboardEvent) {
        const target = evt.target as HTMLElement | null
        if (!target) return false
        const tagName = target.tagName.toLowerCase()
        return tagName === 'input'
            || tagName === 'textarea'
            || tagName === 'select'
            || target.isContentEditable
    }

    private isHandledNavigationKey(key: string) {
        return [
            'w', 'a', 's', 'd',
            'q', 'e',
            'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
            '+', '=', '-', '_',
        ].includes(key)
    }

    public getCameraPosition(): [number, number, number] {
        return [...this.cameraPosition]
    }

    public getCameraState(): CameraState {
        return {
            xRotation: this.xRotation,
            yRotation: this.yRotation,
            viewDist: this.viewDist,
            position: [...this.cameraPosition],
        }
    }

    public setOrbitView(
        xRotation: number,
        yRotation: number,
        viewDist: number,
        focus: [number, number, number] = this.center ?? [0, 0, 0],
    ) {
        this.xRotation = xRotation
        this.yRotation = yRotation
        this.viewDist = Math.max(1, viewDist)
        this.center = [...focus]
        this.cameraPosition = this.getOrbitCameraPosition(focus, this.viewDist, this.xRotation, this.yRotation)
        this.redraw()
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
        
        const view = this.createViewMatrix()
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

    private createViewMatrix() {
        const view = mat4.create()
        mat4.rotate(view, view, this.xRotation, [1, 0, 0])
        mat4.rotate(view, view, this.yRotation, [0, 1, 0])
        mat4.translate(view, view, [-this.cameraPosition[0], -this.cameraPosition[1], -this.cameraPosition[2]])
        return view
    }

    private getOrbitCameraPosition(
        focus: [number, number, number],
        viewDist: number,
        xRotation: number,
        yRotation: number,
    ): [number, number, number] {
        const view = mat4.create()
        mat4.translate(view, view, [0, 0, -viewDist])
        mat4.rotate(view, view, xRotation, [1, 0, 0])
        mat4.rotate(view, view, yRotation, [0, 1, 0])
        mat4.translate(view, view, [-focus[0], -focus[1], -focus[2]])
        const invView = mat4.create()
        mat4.invert(invView, view)
        return [invView[12], invView[13], invView[14]]
    }

    private getWorldDirection(local: [number, number, number]): [number, number, number] {
        const rotation = mat4.create()
        mat4.rotate(rotation, rotation, this.xRotation, [1, 0, 0])
        mat4.rotate(rotation, rotation, this.yRotation, [0, 1, 0])
        const invRotation = mat4.create()
        mat4.invert(invRotation, rotation)
        const dir: [number, number, number] = [
            invRotation[0] * local[0] + invRotation[4] * local[1] + invRotation[8] * local[2],
            invRotation[1] * local[0] + invRotation[5] * local[1] + invRotation[9] * local[2],
            invRotation[2] * local[0] + invRotation[6] * local[1] + invRotation[10] * local[2],
        ]
        const len = Math.hypot(dir[0], dir[1], dir[2])
        if (len > 0) {
            dir[0] /= len
            dir[1] /= len
            dir[2] /= len
        }
        return dir
    }

    private translateCamera(direction: [number, number, number], distance: number) {
        this.cameraPosition[0] += direction[0] * distance
        this.cameraPosition[1] += direction[1] * distance
        this.cameraPosition[2] += direction[2] * distance
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
        if (this.disposed) return
        if (this.framePending) return
        this.framePending = true
        requestAnimationFrame(() => {
            this.framePending = false
            this.renderImmediately()
        })
    }

    private renderImmediately() {
        if (this.disposed) return
        this.yRotation = this.yRotation % (Math.PI * 2)
        this.xRotation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.xRotation))
        this.viewDist = Math.max(1, this.viewDist)

        this.onRender(this.createViewMatrix())
    }

    private animate(now = performance.now()) {
        if (this.disposed) return
        this.isAnimating = true
        if (!this.hasActiveNavigationKey()) {
            this.isAnimating = false
            this.lastAnimationTime = 0
            return
        }
        const deltaSeconds = this.lastAnimationTime > 0
            ? Math.min(0.05, Math.max(0.001, (now - this.lastAnimationTime) / 1000))
            : 1 / 60
        this.lastAnimationTime = now

        const speedScale = (this.keysPressed.has('shift') ? 2.5 : 1) * (this.keysPressed.has('control') ? 0.3 : 1)
        const moveSpeed = Math.max(1.2, Math.min(12, this.viewDist * 0.12)) * deltaSeconds * speedScale
        const rotateSpeed = 1.35 * deltaSeconds * speedScale
        const zoomSpeed = Math.max(1.2, Math.min(12, this.viewDist * 0.12)) * deltaSeconds * speedScale
        const forward = this.getWorldDirection([0, 0, -1])
        const right = this.getWorldDirection([1, 0, 0])

        if (this.keysPressed.has('w')) {
            this.translateCamera(forward, moveSpeed)
        }
        if (this.keysPressed.has('s')) {
            this.translateCamera(forward, -moveSpeed)
        }
        if (this.keysPressed.has('a')) {
            this.translateCamera(right, -moveSpeed)
        }
        if (this.keysPressed.has('d')) {
            this.translateCamera(right, moveSpeed)
        }
        if (this.keysPressed.has('q')) this.cameraPosition[1] -= moveSpeed
        if (this.keysPressed.has('e')) this.cameraPosition[1] += moveSpeed
        if (this.keysPressed.has('arrowleft')) this.yRotation -= rotateSpeed
        if (this.keysPressed.has('arrowright')) this.yRotation += rotateSpeed
        if (this.keysPressed.has('arrowup')) this.xRotation -= rotateSpeed
        if (this.keysPressed.has('arrowdown')) this.xRotation += rotateSpeed
        if (this.keysPressed.has('+') || this.keysPressed.has('=')) {
            this.translateCamera(forward, zoomSpeed)
            this.viewDist = Math.max(1, this.viewDist - zoomSpeed)
        }
        if (this.keysPressed.has('-') || this.keysPressed.has('_')) {
            this.translateCamera(forward, -zoomSpeed)
            this.viewDist += zoomSpeed
        }
        this.renderImmediately()
        requestAnimationFrame((time) => this.animate(time))
    }

    private hasActiveNavigationKey() {
        for (const key of this.keysPressed) {
            if (this.isHandledNavigationKey(key)) return true
        }
        return false
    }

    public dispose() {
        this.disposed = true
        this.keysPressed.clear()
        this.onBlockHover = undefined
        this.events.abort()
    }

}
