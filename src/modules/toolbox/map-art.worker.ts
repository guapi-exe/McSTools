import {generateMapArt} from './map-art'
import type {MapArtInput} from './types'

const worker = self as unknown as {
  onmessage: (event: MessageEvent<MapArtInput>) => void
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}
worker.onmessage = event => {
  try {
    const result = generateMapArt(event.data, value => worker.postMessage({progress: value}))
    worker.postMessage({result}, [result.image.buffer, result.indices.buffer, result.structure.blocks.buffer])
  } catch (error) { worker.postMessage({error: String(error)}) }
}
