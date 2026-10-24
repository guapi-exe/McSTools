import {parse, stringify} from './snbt'
import {Byte, Short, Int, Float, type Tag} from './tag'

export type SourcePath = (string | number)[]
export interface SourceNode {
    path: SourcePath
    name: string
    type: string
    preview: string
    size: number
}
export interface SourcePage { node: SourceNode; items: SourceNode[]; next: number | null }
export const SOURCE_PAGE_SIZE = 100
const EDIT_LIMIT = 64 * 1024

function isScalar(value: Tag) {
    return typeof value !== 'object' || value instanceof Byte || value instanceof Short || value instanceof Int || value instanceof Float
}
function isSequence(value: Tag): value is Tag[] | Uint8Array | Int8Array | Int32Array | BigInt64Array {
    return Array.isArray(value) || ArrayBuffer.isView(value)
}
function typeName(value: Tag): string {
    if (value instanceof Byte) return 'Byte'
    if (value instanceof Short) return 'Short'
    if (value instanceof Int) return 'Int'
    if (value instanceof Float) return 'Float'
    if (typeof value === 'bigint') return 'Long'
    if (typeof value === 'number') return 'Double'
    if (typeof value === 'string') return 'String'
    if (Array.isArray(value)) return 'List'
    if (ArrayBuffer.isView(value)) return value.constructor.name
    return 'Compound'
}

// The complete document stays in the worker. Only a bounded page of node
// summaries crosses IPC; no large arrays or reactive proxies reach Vue.
export class SourceDocument {
    private root!: Tag
    private keys = new WeakMap<object, string[]>()
    load(text: string) { this.root = parse(text); this.keys = new WeakMap(); return this.page([]) }
    private objectKeys(value: object) {
        let keys = this.keys.get(value)
        if (!keys) { keys = Object.keys(value); this.keys.set(value, keys) }
        return keys
    }
    private get(path: SourcePath): Tag {
        let value = this.root
        for (const key of path) {
            if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) throw new Error('节点已不存在，请刷新源数据')
            const parent = value
            value = (value as any)[key]
            if (parent instanceof Uint8Array || parent instanceof Int8Array) value = new Byte((Number(value) << 24) >> 24)
            else if (parent instanceof Int32Array) value = new Int(Number(value))
        }
        return value
    }
    private describe(value: Tag, path: SourcePath): SourceNode {
        const size = isScalar(value) ? 0 : isSequence(value) ? value.length : this.objectKeys(value).length
        const preview = size ? `${size.toLocaleString()} 项` : typeof value === 'string'
            ? JSON.stringify(value.length > 160 ? value.slice(0, 160) + '…' : value)
            : stringify(value)
        return {path, name: path.length ? String(path[path.length - 1]) : '根节点', type: typeName(value), preview, size}
    }
    page(path: SourcePath, offset = 0): SourcePage {
        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('无效的节点分页')
        const value = this.get(path), node = this.describe(value, path)
        const end = Math.min(offset + SOURCE_PAGE_SIZE, node.size)
        const keys = isSequence(value) ? null : isScalar(value) ? [] : this.objectKeys(value)
        const items: SourceNode[] = []
        for (let i = offset; i < end; ++i) {
            const childPath = [...path, keys ? keys[i] : i]
            items.push(this.describe(this.get(childPath), childPath))
        }
        return {node, items, next: end < node.size ? end : null}
    }
    editText(path: SourcePath): string {
        const value = this.get(path)
        // Bound traversal before stringifying: editing a large subtree should
        // not transfer megabytes back to the main thread. Descend to edit it.
        let budget = EDIT_LIMIT
        const count = (entry: Tag): void => {
            budget -= typeof entry === 'string' ? entry.length + 2 : 16
            if (budget < 0) throw new Error('此节点过大，请展开后编辑更小的子节点（每次最多 64 KiB）')
            if (!isScalar(entry)) {
                if (isSequence(entry)) { for (const child of entry) count(child) }
                else for (const [key, child] of Object.entries(entry)) { budget -= key.length; count(child as Tag) }
            }
        }
        count(value)
        const text = stringify(value, {pretty: true})
        if (text.length > EDIT_LIMIT) throw new Error('此节点过大，请展开后编辑更小的子节点')
        return text
    }
    update(path: SourcePath, text: string) {
        if (text.length > EDIT_LIMIT) throw new Error('编辑内容超过 64 KiB 限制')
        const value = parse(text)
        if (!path.length) this.root = value
        else {
            const parent = this.get(path.slice(0, -1)), key = path[path.length - 1]
            if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new Error('节点已不存在')
            if (ArrayBuffer.isView(parent)) {
                const number = value instanceof Byte || value instanceof Int ? value.value : value
                if (parent instanceof BigInt64Array) {
                    if (typeof number !== 'bigint' || number < -(1n << 63n) || number >= (1n << 63n)) throw new Error('Long 数组元素须为 64 位整数（以 l 结尾）')
                } else if (typeof number !== 'number' || !Number.isInteger(number) ||
                    (parent instanceof Int32Array ? number < -2147483648 || number > 2147483647 : number < -128 || number > 127)) {
                    throw new Error('数组元素类型或数值范围不正确')
                }
                ;(parent as any)[key] = number
            } else Object.defineProperty(parent, key, {value, writable: true, enumerable: true, configurable: true})
        }
        this.keys = new WeakMap()
        return this.page(path)
    }
    // Native fastsnbt expects compact input and quoted compound keys; numeric
    // keys must not be interpreted as numeric tags during a save.
    save(): string { return stringify(this.root, {quoteKeys: true}) }
}
