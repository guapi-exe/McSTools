import {RawData, SubData} from "./map_art_data.ts";
import {
    clamp,
    colorDistance,
    createMapArtFromPixels,
    ColorMatchOptions,
    DitherMode,
    DitherOptions,
    hexToRgb,
    loadBlockImages
} from "./image_utils.ts";
import {BlockStatePosList} from "./build_schematic.ts";

export class MapArtProcessor {
    private mapData: RawData[]

    private idToBlockMap: Map<string, SubData>
    private colorToIdsMap: Map<string, Set<string>>
    private MAX_DIMENSION = 8192;
    private MAX_INPUT_PIXELS = 8192 * 8192;
    private MAX_DITHER_PIXELS = 8192 * 8192;
    private MAX_PREVIEW_CANVAS_PIXELS = 4096 * 4096;
    private YIELD_INTERVAL = 8;
    private selectedIds: Set<string>
    private defaultColorOptions: ColorMatchOptions = {
        matchMode: 'weighted',
        brightness: 1,
        contrast: 1,
        saturation: 1,
        gamma: 1,
    }
    private defaultDitherOptions: DitherOptions = {
        mode: 'floyd',
        adaptiveThreshold: 0.35,
    }

    constructor(mapData: RawData[], blocks: string[] = []) {
        this.mapData = mapData
        this.selectedIds = new Set(blocks)
        this.idToBlockMap = new Map()
        this.colorToIdsMap = new Map()

        this._buildIndexes()
    }

    private _buildIndexes() {
        this.idToBlockMap.clear()
        this.colorToIdsMap.clear()

        for (const category of this.mapData) {
            for (const item of category.items) {
                this.idToBlockMap.set(item.id, item)

                const normalizedColor = item.average_rgb_hex.toLowerCase()
                if (!this.colorToIdsMap.has(normalizedColor)) {
                    this.colorToIdsMap.set(normalizedColor, new Set())
                }
                this.colorToIdsMap.get(normalizedColor)?.add(item.id)
            }
        }
    }

    updateBlocksData(blocks: string[] = []) {
        this.selectedIds = new Set(blocks)
        this._buildIndexes()
    }
    updateMapData(newData: RawData[]) {
        this.mapData = newData
        this._buildIndexes()
    }

    selectBlock(id: string) {
        if (this.idToBlockMap.has(id)) {
            this.selectedIds.add(id)
        }
    }

    deselectBlock(id: string) {
        this.selectedIds.delete(id)
    }

    toggleBlock(id: string) {
        if (this.selectedIds.has(id)) {
            this.deselectBlock(id)
        } else {
            this.selectBlock(id)
        }
    }

    getSelectedColorMap(): Map<string, string[]> {
        const result = new Map<string, string[]>()

        for (const id of this.selectedIds) {
            const block = this.idToBlockMap.get(id)
            if (!block) continue

            const color = block.average_rgb_hex.toLowerCase()
            const ids = result.get(color) || []
            ids.push(id)
            result.set(color, ids)
        }

        return result
    }

    getSelectedBlocks(): SubData[] {
        return Array.from(this.selectedIds)
            .map(id => this.idToBlockMap.get(id))
            .filter((item): item is SubData => !!item)
    }

    getBlocksByColor(hexColor: string): SubData[] {
        const normalized = hexColor.toLowerCase()
        const ids = this.colorToIdsMap.get(normalized) || new Set()
        return Array.from(ids)
            .map(id => this.idToBlockMap.get(id))
            .filter((item): item is SubData => !!item)
    }

    isValidBlockId(id: string): boolean {
        return this.idToBlockMap.has(id)
    }

    getCategories(): RawData[] {
        return this.mapData
    }

    async exportSchematic(
        sourceImage: File | HTMLImageElement,
        file_name: string,
        schematic_type: number,
        sub_type: number,
        targetSize?: { width: number; height: number },
        rotation?: 0 | 90 | 180 | 270,
        useDithering: boolean = true,
        replaceAir: boolean = false,
        threeD: boolean = false,
        createMaxZ: number = 1000,
        axios?: 'x' | 'y' | 'z',
        colorOptions?: ColorMatchOptions,
        ditherOptions?: DitherOptions,
    ): Promise<boolean> {
        const resizedCanvas = await this.normalizeInputCanvas(sourceImage, targetSize, rotation)

        const { data, width, height } = this.getImageData(resizedCanvas)
        resizedCanvas.width = 0
        resizedCanvas.height = 0
        const colorTable = this.createColorLookupTable()
        return await createMapArtFromPixels(
            data,
            width,
            height,
            file_name,
            schematic_type,
            sub_type,
            useDithering,
            replaceAir,
            threeD,
            createMaxZ,
            axios || 'y',
            colorTable,
            colorOptions || this.defaultColorOptions,
            ditherOptions || this.defaultDitherOptions,
        )
    }
    async generatePixelArt(
        sourceImage: File | HTMLImageElement,
        blockSize: number = 16,
        targetSize?: { width: number; height: number },
        useDithering: boolean = true,
        replaceAir: boolean = false,
        rotation?: 0 | 90 | 180 | 270,
        colorOptions?: ColorMatchOptions,
        ditherOptions?: DitherOptions,
        renderOptions?: {
            maxCanvasPixels?: number
            maxDimension?: number
            resizeSmoothing?: boolean
        },
    ): Promise<HTMLCanvasElement> {
        const selectedBlocks = this.getSelectedBlocks()
        if (selectedBlocks.length === 0) {
            throw new Error('未选择任何方块')
        }

        const resizedCanvas = await this.normalizeInputCanvas(sourceImage, targetSize, rotation)

        const { data, width, height } = this.getImageData(resizedCanvas)
        resizedCanvas.width = 0
        resizedCanvas.height = 0
        const blockImages = await loadBlockImages(selectedBlocks)
        const colorTable = this.createColorLookupTable()
        const applyOptions = colorOptions || this.defaultColorOptions
        const applyDither = ditherOptions || this.defaultDitherOptions
        const pixelCount = width * height
        const effectiveDitherMode: DitherMode =
            pixelCount > this.MAX_DITHER_PIXELS && applyDither.mode !== 'ordered' && applyDither.mode !== 'none'
                ? 'ordered'
                : applyDither.mode
        const effectiveDitherOptions: DitherOptions = {
            ...applyDither,
            mode: effectiveDitherMode,
        }
        const shouldDither = useDithering
            && effectiveDitherMode !== 'none'
            && pixelCount <= this.MAX_INPUT_PIXELS
        const processedData = shouldDither
            ? await this.applyDithering(data, width, height, false, colorTable, applyOptions, effectiveDitherOptions)
            : data

        const blockCount = width * height
        const maxCanvasPixels = renderOptions?.maxCanvasPixels ?? this.MAX_PREVIEW_CANVAS_PIXELS
        const maxDimension = renderOptions?.maxDimension ?? this.MAX_DIMENSION
        const maxBlockSize = Math.max(1, Math.floor(Math.sqrt(maxCanvasPixels / blockCount)))
        const renderBlockSize = Math.max(1, Math.min(blockSize, maxBlockSize))

        let outputCanvas = document.createElement('canvas')
        outputCanvas.width = width * renderBlockSize
        outputCanvas.height = height * renderBlockSize
        if (outputCanvas.width * outputCanvas.height > maxCanvasPixels) {
            throw new Error('预览尺寸过大，请进一步降低分辨率')
        }
        const ctx = outputCanvas.getContext('2d')
        if (!ctx) throw new Error('Cannot create canvas context')
        ctx.imageSmoothingEnabled = false

        const batchSize = Math.max(2048, Math.min(16384, Math.floor((width * height) / 200)))
        const nearestCache = new Map<number, string>()
        let batchCount = 0
        for (let i = 0; i < width * height; i += batchSize) {
            this.processBatch(i, Math.min(i + batchSize, width * height), {
                data: processedData,
                width,
                height,
                blockSize: renderBlockSize,
                ctx,
                colorTable,
                blockImages,
                replaceAir,
                nearestCache,
                colorOptions: applyOptions
            })
            batchCount++
            if (batchCount % this.YIELD_INTERVAL === 0) {
                await this.yieldToMainThread()
            }
        }
        if (
            outputCanvas.width > maxDimension
            || outputCanvas.height > maxDimension
            || outputCanvas.width * outputCanvas.height > maxCanvasPixels
        ){
            const scaleFactor = Math.min(
                maxDimension / outputCanvas.width,
                maxDimension / outputCanvas.height,
                Math.sqrt(maxCanvasPixels / (outputCanvas.width * outputCanvas.height))
            );

            const targetSize = {
                width: Math.floor(outputCanvas.width * scaleFactor),
                height: Math.floor(outputCanvas.height * scaleFactor)
            };
            outputCanvas = await this.resizeImageCanvas(
                outputCanvas,
                targetSize,
                renderOptions?.resizeSmoothing ?? false
            );
        }

        return outputCanvas
    }

    private async normalizeInputCanvas(
        sourceImage: File | HTMLImageElement,
        targetSize?: { width: number; height: number },
        rotation?: 0 | 90 | 180 | 270
    ): Promise<HTMLCanvasElement> {
        const imageBitmap = await createImageBitmap(sourceImage)

        const sourceWidth = imageBitmap.width
        const sourceHeight = imageBitmap.height
        const sourcePixels = sourceWidth * sourceHeight

        const safeScale = sourcePixels > this.MAX_INPUT_PIXELS
            ? Math.sqrt(this.MAX_INPUT_PIXELS / sourcePixels)
            : 1

        const normalizedRotation = rotation ?? 0
        const rotatedWidth = normalizedRotation % 180 === 90 ? sourceHeight : sourceWidth
        const rotatedHeight = normalizedRotation % 180 === 90 ? sourceWidth : sourceHeight

        const baseWidth = Math.max(1, Math.floor(rotatedWidth * safeScale))
        const baseHeight = Math.max(1, Math.floor(rotatedHeight * safeScale))

        let finalWidth = Math.max(1, targetSize?.width || baseWidth)
        let finalHeight = Math.max(1, targetSize?.height || baseHeight)

        const finalPixels = finalWidth * finalHeight
        if (finalPixels > this.MAX_INPUT_PIXELS) {
            const limitScale = Math.sqrt(this.MAX_INPUT_PIXELS / finalPixels)
            finalWidth = Math.max(1, Math.floor(finalWidth * limitScale))
            finalHeight = Math.max(1, Math.floor(finalHeight * limitScale))
        }

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: false })
        if (!ctx) {
            imageBitmap.close()
            throw new Error('无法创建临时画布')
        }

        canvas.width = finalWidth
        canvas.height = finalHeight

        ctx.imageSmoothingQuality = 'high'
        ctx.imageSmoothingEnabled = true

        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((normalizedRotation * Math.PI) / 180)

        const drawTargetWidth = normalizedRotation % 180 === 90 ? sourceHeight : sourceWidth
        const drawTargetHeight = normalizedRotation % 180 === 90 ? sourceWidth : sourceHeight
        const scaleX = finalWidth / drawTargetWidth
        const scaleY = finalHeight / drawTargetHeight
        const scale = Math.min(scaleX, scaleY)

        ctx.scale(scale, scale)
        ctx.drawImage(
            imageBitmap,
            -drawTargetWidth / 2,
            -drawTargetHeight / 2,
            drawTargetWidth,
            drawTargetHeight
        )
        ctx.restore()
        imageBitmap.close()

        return canvas
    }

    private async resizeImageCanvas(
        originalCanvas: HTMLCanvasElement,
        targetSize?: { width: number; height: number },
        imageSmoothingEnabled: boolean = false
    ): Promise<HTMLCanvasElement> {
        if (!targetSize ||
            (targetSize.width === originalCanvas.width &&
                targetSize.height === originalCanvas.height)) {
            return originalCanvas;
        }

        const sourceCanvas = document.createElement('canvas');
        const sourceCtx = sourceCanvas.getContext('2d');
        if (!sourceCtx) throw new Error('无法创建源画布上下文');

        sourceCanvas.width = originalCanvas.width;
        sourceCanvas.height = originalCanvas.height;
        sourceCtx.drawImage(originalCanvas, 0, 0);

        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = targetSize.width;
        targetCanvas.height = targetSize.height;

        const targetCtx = targetCanvas.getContext('2d', {
            willReadFrequently: false
        });
        if (!targetCtx) throw new Error('无法创建目标画布上下文');

        targetCtx.imageSmoothingEnabled = imageSmoothingEnabled;
        if (imageSmoothingEnabled) {
            targetCtx.imageSmoothingQuality = 'high';
        }

        targetCtx.drawImage(
            sourceCanvas,
            0, 0, sourceCanvas.width, sourceCanvas.height,
            0, 0, targetSize.width, targetSize.height
        );

        sourceCanvas.width = 0;
        sourceCanvas.height = 0;

        return targetCanvas;
    }

    private getImageData(image: HTMLCanvasElement): ImageData {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('无法创建临时画布')

        canvas.width = image.width
        canvas.height = image.height
        ctx.drawImage(image, 0, 0)
        const result = ctx.getImageData(0, 0, canvas.width, canvas.height)
        canvas.width = 0
        canvas.height = 0
        return result
    }

    private createColorLookupTable(): Array<{ r: number; g: number; b: number; blockId: string }> {
        const table: Array<{ r: number; g: number; b: number; blockId: string }> = []

        const colorMap = this.getSelectedColorMap()
        for (const [hex, blockIds] of colorMap) {
            const rgb = hexToRgb(hex)
            if (rgb && blockIds.length > 0) {
                table.push({ r: rgb.r, g: rgb.g, b: rgb.b, blockId: blockIds[0] })
            }
        }

        return table
    }

    processSchematic(
        context: {
            data: Uint8ClampedArray
            width: number
            height: number
            colorTable: Array<{ r: number; g: number; b: number; blockId: string }>
            schematic_type: number,
            sub_type: number,
            threeD: boolean,
            maxZ: number,
            blockList: BlockStatePosList
            axios?: 'x' | 'y' | 'z',
            base?: { x: number; y: number; z: number },
            flipX?: boolean,
            flipY?: boolean
            replaceAir: boolean
        }
    ) {
        let {
            width,
            height,
            axios = 'y',
            base = { x: 0, y: 0, z: 0 },
            flipX = false,
            flipY = false
        } = context;
        let maxZ = -Infinity
        let minZ = Infinity
        let lastZ = base.z;
        const nearestCache = new Map<number, { blockId: string; zOffset: number }>()
        for (let rawX = 0; rawX < width; rawX++) {
            for (let rawY = 0; rawY < height; rawY++) {
                let i = rawY * width + rawX
                if (rawY == 0) lastZ = base.z;
                let imageX = rawX, imageY = rawY;
                switch(axios.toLowerCase()) {
                    case 'x':
                        imageY = height - rawY - 1;
                        break;
                    case 'y':
                        break;
                    case 'z':
                        imageY = height - rawY - 1;
                        break;
                }

                imageX = flipX ? width - imageX - 1 : imageX;
                imageY = flipY ? height - imageY - 1 : imageY;

                let x3d: number, y3d: number, z3d: number;

                switch(axios.toLowerCase()) {
                    case 'x':
                        x3d = base.x;
                        y3d = base.y + imageY;
                        z3d = base.z + imageX;
                        break;
                    case 'y':
                        x3d = base.x + imageX;
                        y3d = base.y;
                        z3d = base.z + imageY;
                        break;
                    case 'z':
                        x3d = base.x + imageX;
                        y3d = base.y + imageY;
                        z3d = base.z;
                        break;
                }

                const index = i * 4;
                const r = context.data[index]
                const g = context.data[index + 1]
                const b = context.data[index + 2]

                let minDistance = Infinity;
                let closestBlockId = '';
                if (context.data[index + 3] === 0 && context.replaceAir) {
                    context.blockList.addBlockByPos(x3d, y3d, z3d, 'air');
                    continue;
                }
                const threeDLayers = [
                    { brightness: 255, zOffset: 1 },
                    { brightness: 180, zOffset: -1 },
                    { brightness: 220, zOffset: 0 }

                ];
                let tempZ = 0
                const cacheKey = this.createCacheKey(r, g, b, context.threeD)
                const cached = nearestCache.get(cacheKey)
                if (cached) {
                    closestBlockId = cached.blockId
                    tempZ = cached.zOffset
                } else if(context.threeD){
                    for (const layer of threeDLayers) {
                        const factor = layer.brightness / 255
                        for (const entry of context.colorTable) {
                            const adjustedR = Math.round(entry.r * factor)
                            const adjustedG = Math.round(entry.g * factor)
                            const adjustedB = Math.round(entry.b * factor)
                            const distance = colorDistance(r, g, b, adjustedR, adjustedG, adjustedB)
                            if (distance < minDistance) {
                                minDistance = distance
                                closestBlockId = entry.blockId
                                tempZ = layer.zOffset
                            }
                        }
                    }
                    nearestCache.set(cacheKey, { blockId: closestBlockId, zOffset: tempZ })
                }else {
                    for (const entry of context.colorTable) {
                        const distance = colorDistance(r, g, b, entry.r, entry.g, entry.b)
                        if (distance < minDistance) {
                            minDistance = distance
                            closestBlockId = entry.blockId
                        }
                    }
                    nearestCache.set(cacheKey, { blockId: closestBlockId, zOffset: 0 })
                }
                lastZ = lastZ + tempZ;
                if(context.threeD){
                    if (lastZ >= context.maxZ) lastZ = 0;
                    if (lastZ <= -context.maxZ) lastZ = 0;
                }
                if (lastZ < minZ){
                    minZ = lastZ
                }
                if (lastZ > maxZ){
                    maxZ = lastZ
                }

                if (closestBlockId) {
                    switch(axios.toLowerCase()) {
                        case 'x':
                            context.blockList.addBlockByPos(lastZ, y3d, z3d, closestBlockId);
                            break;
                        case 'y':
                            context.blockList.addBlockByPos(x3d, lastZ, z3d, closestBlockId);
                            break;
                        case 'z':
                            context.blockList.addBlockByPos(x3d, y3d, lastZ, closestBlockId);
                            break;
                    }
                }
            }

        }
        return({minZ, maxZ})
    }
    private processBatch(
        start: number,
        end: number,
        context: {
            data: Uint8ClampedArray
            width: number
            height: number
            blockSize: number
            ctx: CanvasRenderingContext2D
            colorTable: Array<{ r: number; g: number; b: number; blockId: string }>
            blockImages: Map<string, HTMLImageElement>
            replaceAir: boolean
            nearestCache: Map<number, string>
            colorOptions: ColorMatchOptions
        }
    ) {
        for (let i = start; i < end; i++) {
            const x = i % context.width
            const y = Math.floor(i / context.width)
            const index = i * 4

            const r = context.data[index]
            const g = context.data[index + 1]
            const b = context.data[index + 2]


            let minDistance = Infinity
            let closestBlockId = ''
            const cacheKey = this.createCacheKey(r, g, b, false)
            const cached = context.nearestCache.get(cacheKey)
            if (cached !== undefined) {
                closestBlockId = cached
            } else {
                for (const entry of context.colorTable) {
                    const distance = this.colorDistanceByMode(
                        context.colorOptions.matchMode,
                        r,
                        g,
                        b,
                        entry.r,
                        entry.g,
                        entry.b
                    )
                    if (distance < minDistance) {
                        minDistance = distance
                        closestBlockId = entry.blockId
                    }
                }
                context.nearestCache.set(cacheKey, closestBlockId)
            }
            if (context.data[index + 3] == 0 && context.replaceAir) {
                context.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                context.ctx.fillRect(
                    x * context.blockSize,
                    y * context.blockSize,
                    context.blockSize,
                    context.blockSize
                );
            }else {
                if (closestBlockId) {
                    const img = context.blockImages.get(closestBlockId)
                    if (img) {
                        context.ctx.drawImage(
                            img,
                            x * context.blockSize,
                            y * context.blockSize,
                            context.blockSize,
                            context.blockSize
                        )
                    }
                }
            }

        }
    }

    private createCacheKey(r: number, g: number, b: number, threeD: boolean): number {
        return ((threeD ? 1 : 0) << 24) | (r << 16) | (g << 8) | b
    }

    private async applyDithering(
        data: Uint8ClampedArray,
        width: number,
        height: number,
        threeD: boolean = false,
        colorTable: Array<{ r: number; g: number; b: number; blockId: string }>,
        colorOptions: ColorMatchOptions,
        ditherOptions: DitherOptions
    ): Promise<Uint8ClampedArray> {
        const buffer = data
        const nearestCache = new Map<number, { r: number; g: number; b: number; blockId: string }>()
        const mode: DitherMode = ditherOptions.mode || 'floyd'
        const adaptive = Math.min(1, Math.max(0, ditherOptions.adaptiveThreshold ?? 0.35))
        const bayer4 = [
            [0, 8, 2, 10],
            [12, 4, 14, 6],
            [3, 11, 1, 9],
            [15, 7, 13, 5]
        ]

        if (mode === 'none') {
            return buffer
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4
                if (buffer[idx + 3] === 0) {
                    continue
                }

                const oldR = buffer[idx]
                const oldG = buffer[idx + 1]
                const oldB = buffer[idx + 2]
                const adjusted = this.adjustColor(oldR, oldG, oldB, colorOptions)

                let sampleR = adjusted.r
                let sampleG = adjusted.g
                let sampleB = adjusted.b

                if (mode === 'ordered') {
                    const threshold = bayer4[y % 4][x % 4] / 16 - 0.5
                    const edge = this.computeEdgeStrength(buffer, x, y, width, height)
                    const amp = 24 * (1 - adaptive * (1 - edge))
                    sampleR = clamp(sampleR + threshold * amp)
                    sampleG = clamp(sampleG + threshold * amp)
                    sampleB = clamp(sampleB + threshold * amp)
                }

                const cacheKey = this.createCacheKey(sampleR, sampleG, sampleB, threeD)
                let nearest = nearestCache.get(cacheKey)
                if (!nearest) {
                    nearest = this.findNearestColor(sampleR, sampleG, sampleB, threeD, colorTable, colorOptions)
                    nearestCache.set(cacheKey, nearest)
                }

                buffer[idx] = nearest.r
                buffer[idx + 1] = nearest.g
                buffer[idx + 2] = nearest.b

                if (mode === 'ordered') {
                    continue
                }

                const errR = oldR - nearest.r
                const errG = oldG - nearest.g
                const errB = oldB - nearest.b
                const edge = this.computeEdgeStrength(buffer, x, y, width, height)
                const adaptiveScale = Math.max(0.2, 1 - adaptive * (1 - edge) * 0.8)

                if (mode === 'atkinson') {
                    this.diffuseError(buffer, x + 1, y, width, height, errR, errG, errB, 1 / 8, adaptiveScale)
                    this.diffuseError(buffer, x + 2, y, width, height, errR, errG, errB, 1 / 8, adaptiveScale)
                    this.diffuseError(buffer, x - 1, y + 1, width, height, errR, errG, errB, 1 / 8, adaptiveScale)
                    this.diffuseError(buffer, x, y + 1, width, height, errR, errG, errB, 1 / 8, adaptiveScale)
                    this.diffuseError(buffer, x + 1, y + 1, width, height, errR, errG, errB, 1 / 8, adaptiveScale)
                    this.diffuseError(buffer, x, y + 2, width, height, errR, errG, errB, 1 / 8, adaptiveScale)
                } else {
                    if (x < width - 1) {
                        this.diffuseError(buffer, x + 1, y, width, height, errR, errG, errB, 7 / 16, adaptiveScale)
                    }
                    if (y < height - 1) {
                        if (x > 0) {
                            this.diffuseError(buffer, x - 1, y + 1, width, height, errR, errG, errB, 3 / 16, adaptiveScale)
                        }
                        this.diffuseError(buffer, x, y + 1, width, height, errR, errG, errB, 5 / 16, adaptiveScale)
                        if (x < width - 1) {
                            this.diffuseError(buffer, x + 1, y + 1, width, height, errR, errG, errB, 1 / 16, adaptiveScale)
                        }
                    }
                }
            }
            if (y % 64 === 0) {
                await this.yieldToMainThread()
            }
        }
        return buffer
    }

    private diffuseError(
        buffer: Uint8ClampedArray,
        targetX: number,
        targetY: number,
        width: number,
        height: number,
        errR: number,
        errG: number,
        errB: number,
        factor: number,
        adaptiveScale: number
    ) {
        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) {
            return
        }
        const targetIdx = (targetY * width + targetX) * 4
        const f = factor * adaptiveScale
        buffer[targetIdx] = clamp(buffer[targetIdx] + errR * f)
        buffer[targetIdx + 1] = clamp(buffer[targetIdx + 1] + errG * f)
        buffer[targetIdx + 2] = clamp(buffer[targetIdx + 2] + errB * f)
    }

    private computeEdgeStrength(
        buffer: Uint8ClampedArray,
        x: number,
        y: number,
        width: number,
        height: number
    ): number {
        const idx = (y * width + x) * 4
        const r = buffer[idx]
        const g = buffer[idx + 1]
        const b = buffer[idx + 2]

        let total = 0
        let count = 0
        const neighbors = [
            [x + 1, y],
            [x, y + 1],
            [x - 1, y],
            [x, y - 1]
        ]
        for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const nIdx = (ny * width + nx) * 4
            total += Math.abs(r - buffer[nIdx]) + Math.abs(g - buffer[nIdx + 1]) + Math.abs(b - buffer[nIdx + 2])
            count++
        }

        if (count === 0) return 1
        const normalized = total / (count * 255 * 3)
        return Math.min(1, Math.max(0, normalized * 2))
    }


    private findNearestColor(
        r: number,
        g: number,
        b: number,
        threeD: boolean = false,
        colorTable: Array<{ r: number; g: number; b: number; blockId: string }>,
        colorOptions: ColorMatchOptions
    ): { r: number; g: number; b: number; blockId: string } {
        let minDistance = Infinity
        let nearestEntry: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
        let blockId = ''
        const threeDLayers = [
            { brightness: 255 },
            { brightness: 180 },
            { brightness: 220 }

        ];
        if (threeD){
            threeDLayers.forEach(layer => {
                const factor = layer.brightness / 255
                for (const entry of colorTable) {
                    const adjustedColor = {
                        r: Math.round(entry.r * factor),
                        g: Math.round(entry.g * factor),
                        b: Math.round(entry.b * factor)
                    }
                    const distance = this.colorDistance(
                        colorOptions.matchMode,
                        r, g, b,
                        adjustedColor.r, adjustedColor.g, adjustedColor.b
                    )
                    if (distance < minDistance) {
                        minDistance = distance
                        nearestEntry = adjustedColor
                        blockId = entry.blockId
                    }
                }
            })
        }else {
            for (const entry of colorTable) {
                const distance = this.colorDistance(
                    colorOptions.matchMode,
                    r, g, b,
                    entry.r, entry.g, entry.b
                )
                if (distance < minDistance) {
                    minDistance = distance
                    nearestEntry = {
                        r: entry.r,
                        g: entry.g,
                        b: entry.b,
                    }
                    blockId = entry.blockId
                }
            }
        }

        return {
            r: nearestEntry.r,
            g: nearestEntry.g,
            b: nearestEntry.b,
            blockId: blockId
        }
    }

    private adjustColor(r: number, g: number, b: number, options: ColorMatchOptions): { r: number; g: number; b: number } {
        let rf = r / 255
        let gf = g / 255
        let bf = b / 255

        const gamma = Math.max(0.01, options.gamma || 1)
        rf = Math.pow(rf, 1 / gamma)
        gf = Math.pow(gf, 1 / gamma)
        bf = Math.pow(bf, 1 / gamma)

        const sat = Math.min(2, Math.max(0, options.saturation || 1))
        const l = 0.2126 * rf + 0.7152 * gf + 0.0722 * bf
        rf = l + (rf - l) * sat
        gf = l + (gf - l) * sat
        bf = l + (bf - l) * sat

        const contrast = Math.min(2, Math.max(0.2, options.contrast || 1))
        rf = Math.min(1, Math.max(0, ((rf - 0.5) * contrast + 0.5)))
        gf = Math.min(1, Math.max(0, ((gf - 0.5) * contrast + 0.5)))
        bf = Math.min(1, Math.max(0, ((bf - 0.5) * contrast + 0.5)))

        const brightness = Math.min(2, Math.max(0.2, options.brightness || 1))
        rf = Math.min(1, Math.max(0, rf * brightness))
        gf = Math.min(1, Math.max(0, gf * brightness))
        bf = Math.min(1, Math.max(0, bf * brightness))

        return {
            r: clamp(rf * 255),
            g: clamp(gf * 255),
            b: clamp(bf * 255)
        }
    }

    private colorDistance(
        mode: 'rgb' | 'weighted' | 'redmean',
        r1: number, g1: number, b1: number,
        r2: number, g2: number, b2: number
    ): number {
        const dr = r1 - r2
        const dg = g1 - g2
        const db = b1 - b2
        if (mode === 'weighted') {
            return 2 * dr * dr + 4 * dg * dg + 3 * db * db
        }
        if (mode === 'redmean') {
            const rmean = (r1 + r2) / 2
            return (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db
        }
        return dr * dr + dg * dg + db * db
    }

    private colorDistanceByMode(
        mode: 'rgb' | 'weighted' | 'redmean',
        r1: number, g1: number, b1: number,
        r2: number, g2: number, b2: number
    ): number {
        return this.colorDistance(mode, r1, g1, b1, r2, g2, b2)
    }

    private async yieldToMainThread() {
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
    }
}
