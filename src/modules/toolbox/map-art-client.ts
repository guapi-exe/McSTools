import type {MapArtInput, MapArtResult} from './types'

/** One disposable worker per run. Termination cancels synchronous matching immediately. */
export function runMapArt(input: MapArtInput, signal: AbortSignal, progress: (value: number) => void): Promise<MapArtResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('已取消生成', 'AbortError')); return }
    const worker = new Worker(new URL('./map-art.worker.ts', import.meta.url), {type: 'module'})
    const finish = () => { worker.terminate(); signal.removeEventListener('abort', abort) }
    const abort = () => { finish(); reject(new DOMException('已取消生成', 'AbortError')) }
    signal.addEventListener('abort', abort, {once: true})
    worker.onerror = event => { finish(); reject(new Error(event.message || '生成进程失败')) }
    worker.onmessageerror = () => { finish(); reject(new Error('生成结果传输失败')) }
    worker.onmessage = ({data}) => {
      if ('progress' in data) { progress(data.progress); return }
      finish()
      if (data.error) reject(new Error(data.error))
      else resolve(data.result)
    }
    try { worker.postMessage(input, [input.rgba.buffer]) }
    catch (error) { finish(); reject(error) }
  })
}
