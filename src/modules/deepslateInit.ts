import {mat4} from 'gl-matrix'

import {
    BlockDefinition,
    BlockModel,
    Identifier,
    ItemModel,
    type ItemRendererResources,
    jsonToNbt,
    type NbtTag,
    type Resources,
    TextureAtlas,
    upperPowerOfTwo
} from "deepslate";
import {ref} from "vue";
const jsonModules = import.meta.glob([
    '../static/item/data.min.json',
    '../assets/block_definition/data.min.json',
    '../assets/model/data.min.json',
    '../assets/item_definition/data.min.json',
    '../assets/item_components/data.min.json',
    '../assets/atlas/data.min.json'
], { eager: true, import: 'default' })
export const blocks_resources = ref<Resources & ItemRendererResources>()
export interface CameraState {
    xRotation: number
    yRotation: number
    viewDist: number
}
export class InteractiveCanvas {
    private xRotation = 0.8
    private yRotation = 0.5
    private viewDist = 32
    constructor(
        canvas: HTMLCanvasElement,
        camera: CameraState = {xRotation: 0.8, yRotation: 0.5, viewDist: 32},
        private readonly onRender: (view: mat4) => void,
        private readonly center?: [number, number, number],

    ) {
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
            }
        })
        canvas.addEventListener('mouseup', () => {
            dragPos = null
        })
        canvas.addEventListener('wheel', evt => {
            evt.preventDefault()
            this.viewDist += evt.deltaY / 100
            this.redraw()
        })
        this.redraw()
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
    await Promise.all([
        jsonModules['../static/item/data.min.json'],
        jsonModules[`../assets/block_definition/data.min.json`],
        jsonModules[`../assets/model/data.min.json`],
        jsonModules[`../assets/item_definition/data.min.json`],
        jsonModules[`../assets/item_components/data.min.json`],
        jsonModules[`../assets/atlas/data.min.json`],
        new Promise<HTMLImageElement>(res => {
            const image = new Image()
            image.onload = () => res(image)
            image.crossOrigin = 'Anonymous'
            image.src = new URL(`../assets/atlas/atlas.png`, import.meta.url).href
        }),
    ]).then(async ([items, blockstates, models, item_models, item_components, uvMap, atlas]) => {
        console.log(items);

        const blockDefinitions: Record<string, BlockDefinition> = {}
        Object.keys(blockstates).forEach(id => {
            blockDefinitions['minecraft:' + id] = BlockDefinition.fromJson(blockstates[id])
        })

        const blockModels: Record<string, BlockModel> = {}
        Object.keys(models).forEach(id => {
            blockModels['minecraft:' + id] = BlockModel.fromJson(models[id])
        })
        Object.values(blockModels).forEach((m: any) => m.flatten({getBlockModel: id => blockModels[id]}))

        const itemModels: Record<string, ItemModel> = {}
        Object.keys(item_models).forEach(id => {
            itemModels['minecraft:' + id] = ItemModel.fromJson(item_models[id].model)
        })

        const itemComponents: Record<string, Map<string, NbtTag>> = {}
        Object.keys(item_components).forEach(id => {
            const components = new Map<string, NbtTag>()
            Object.keys(item_components[id]).forEach(c_id => {
                components.set(c_id, jsonToNbt(item_components[id][c_id]))
            })
            itemComponents['minecraft:' + id] = components
        })

        const atlasCanvas = document.createElement('canvas')
        const atlasSize = upperPowerOfTwo(Math.max(atlas.width, atlas.height))
        atlasCanvas.width = atlasSize
        atlasCanvas.height = atlasSize
        const atlasCtx = atlasCanvas.getContext('2d')!
        atlasCtx.drawImage(atlas, 0, 0)
        const atlasData = atlasCtx.getImageData(0, 0, atlasSize, atlasSize)
        const idMap = {}
        Object.keys(uvMap).forEach(id => {
            const [u, v, du, dv] = uvMap[id]
            const dv2 = (du !== dv && id.startsWith('block/')) ? du : dv
            idMap[Identifier.create(id).toString()] = [u / atlasSize, v / atlasSize, (u + du) / atlasSize, (v + dv2) / atlasSize]
        })
        const textureAtlas = new TextureAtlas(atlasData, idMap)

        blocks_resources.value = {
            getBlockDefinition(id) {
                return blockDefinitions[id.toString()]
            },
            getBlockModel(id) {
                return blockModels[id.toString()]
            },
            getTextureUV(id) {
                return textureAtlas.getTextureUV(id)
            },
            getTextureAtlas() {
                return textureAtlas.getTextureAtlas()
            },
            getBlockFlags() {
                return {opaque: false}
            },
            getBlockProperties() {
                return null
            },
            getDefaultBlockProperties() {
                return {}
            },
            getItemModel(id) {
                return itemModels[id.toString()]
            },
            getItemComponents(id) {
                return itemComponents[id.toString()]
            },
        }
    })
}

