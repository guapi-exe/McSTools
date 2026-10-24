import type {SourcePath} from './source_document'
export class SourceClient {
    private worker = new Worker(new URL('./source.worker.ts', import.meta.url), {type: 'module'})
    private sequence = 0
    private disposed = false
    private pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>()
    constructor() {
        this.worker.onmessage = ({data}) => {
            const task = this.pending.get(data.id)
            this.pending.delete(data.id)
            if (data.error) task?.reject(new Error(data.error))
            else task?.resolve(data.result)
        }
        this.worker.onerror = () => this.dispose()
    }
    request<T>(action: string, args: {path?: SourcePath; offset?: number; text?: string} = {}): Promise<T> {
        if (this.disposed) return Promise.reject(new Error('源数据后台任务已结束，请重新加载'))
        const id = ++this.sequence
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject})
            this.worker.postMessage({id, action, ...args})
        })
    }
    dispose() {
        this.disposed = true
        this.worker.terminate()
        for (const task of this.pending.values()) task.reject(new Error('源数据后台任务已结束'))
        this.pending.clear()
    }
}
