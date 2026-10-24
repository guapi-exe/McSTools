import JSONEditor from 'jsoneditor'
import type {Ace} from 'ace-builds'
import jsonWorkerUrl from 'ace-builds/src-noconflict/worker-json.js?url&no-inline'

// JSONEditor's bundled Ace defaults to importScripts(data:...) inside a Blob
// Worker, which the packaged WebView rejects. Reuse that exact Ace instance,
// but load its existing worker as a same-origin build asset. Do not disable
// validation, enable unsafe-eval, or fetch worker code from a CDN.
// @types/jsoneditor exposes an older Ace interface without its public config.
const config = (JSONEditor.ace as typeof JSONEditor.ace & {config: Ace.Config}).config
config.setModuleUrl('ace/mode/json_worker', jsonWorkerUrl)
config.set('loadWorkerFromBlob', false)
