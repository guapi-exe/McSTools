import {SourceDocument, type SourcePath} from './source_document'
const document = new SourceDocument()
self.onmessage = ({data}: MessageEvent<{id: number; action: string; path?: SourcePath; offset?: number; text?: string}>) => {
    const {id, action, path = [], offset = 0, text = ''} = data
    try {
        let result: unknown
        switch (action) {
            case 'load': result = document.load(text); break
            case 'page': result = document.page(path, offset); break
            case 'edit': result = document.editText(path); break
            case 'update': result = document.update(path, text); break
            case 'save': result = document.save(); break
            default: throw new Error('未知的源数据操作')
        }
        self.postMessage({id, result})
    } catch (cause) {
        self.postMessage({id, error: cause instanceof Error ? cause.message : '源数据处理失败'})
    }
}
