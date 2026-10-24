import {getBlockImg} from '../others'
import type {MapArtResult} from './types'

export function mapColorCanvas(result: MapArtResult): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = result.width; canvas.height = result.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建预览画布')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(result.image), result.width, result.height), 0, 0)
  return canvas
}

/** Texture export uses the exact generated pixel indices, never a second color match. */
export async function mapTextureCanvas(result: MapArtResult, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const check = () => { if (signal.aborted) throw new DOMException('已取消生成', 'AbortError') }
  const {width, height, indices, structure} = result
  const blockSize = Math.max(1, Math.min(32, Math.floor(8192 / Math.max(width, height)), Math.floor(Math.sqrt(16_777_216 / (width * height)))))
  const used = new Set(indices)
  const images = new Map<number, HTMLImageElement>()
  await Promise.all(Array.from(used).filter(Boolean).map(async index => {
    const image = new Image()
    await new Promise<void>(resolve => {
      let timer: ReturnType<typeof setTimeout>
      const finish = () => {
        clearTimeout(timer); signal.removeEventListener('abort', abort)
        image.onload = image.onerror = null; resolve()
      }
      const abort = () => { finish(); image.src = 'data:,' }
      if (signal.aborted) { resolve(); return }
      signal.addEventListener('abort', abort, {once: true})
      timer = setTimeout(abort, 10_000)
      image.onload = () => { images.set(index, image); finish() }
      image.onerror = finish // Missing texture falls back to the measured pixel color.
      image.src = getBlockImg(structure.palette[index].replace(/^minecraft:/, ''))
    })
  }))
  check()
  const canvas = document.createElement('canvas')
  canvas.width = width * blockSize; canvas.height = height * blockSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建纹理画布')
  ctx.imageSmoothingEnabled = false
  try {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x, index = indices[p]
        if (!index) continue
        const image = images.get(index)
        if (image) ctx.drawImage(image, x * blockSize, y * blockSize, blockSize, blockSize)
        else {
          ctx.fillStyle = `rgb(${result.image[p * 4]},${result.image[p * 4 + 1]},${result.image[p * 4 + 2]})`
          ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize)
        }
      }
      if (y % 16 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); check() }
    }
    return canvas
  } catch (error) { canvas.width = canvas.height = 0; throw error }
}
