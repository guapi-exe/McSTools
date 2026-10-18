import {invoke} from '@tauri-apps/api/core'
import type {EditRegion} from './blueprint_editor'
import type {Size} from './schematic_data'

export type ExportSource = {kind: 'library'; id: number}
  | {kind: 'editor'; session_id: number; revision: number; scope: 'all' | 'inside' | 'outside'; region: EditRegion | null}
export interface ExportOptions {
  format: number; subtype: number; targetDataVersion: number | null
  overrides: VersionOverride[]; includeAir: boolean
}
export interface VersionOverride { sourceId: string; replacementId: string }
export interface ExportFormat {
  id: number; name: string; extension: string
  subtypes: {id: number; name: string; versions: {id: number; name: string}[]}[]
}
export interface VersionChange {
  sourceId: string; replacementId: string | null; count: number
  idChanged: boolean; propertiesChanged: boolean; error: string | null
}
export interface ExportPlan {
  sourceDataVersion: number | null; outputDataVersion: number | null; size: Size
  compatibility: {target: {name: string; id: number}; changes: VersionChange[]; targetBlocks: string[]; moddedBlockCount: number} | null
  warnings: string[]
}
export interface ExportResult {
  canceled: boolean; filename: string | null; bytes: number; destination: 'file' | 'library'
}
let formats: Promise<ExportFormat[]> | undefined
export function getExportFormats() {
  return formats ??= invoke<ExportFormat[]>('get_blueprint_export_formats').catch(error => {
    formats = undefined
    throw error
  })
}
export const planExport = (source: ExportSource, options: ExportOptions) =>
  invoke<ExportPlan>('plan_blueprint_export', {source, options})
export const saveExport = (source: ExportSource, options: ExportOptions, destination: 'file' | 'library') =>
  invoke<ExportResult>('save_blueprint_export', {source, options, destination})

export function exportError(reason: unknown): string {
  const text = String(reason)
  const known: [string, string][] = [
    ['source DataVersion is unknown', '源文件没有可靠的 Java DataVersion，请明确选择目标游戏版本。'],
    ['MCEdit requires an explicit', '源文件不是旧版数字格式，请选择 1.7.10–1.12.2 中的目标游戏版本。'],
    ['source version is outside', '源版本超出此格式范围，请明确选择目标游戏版本。'],
    ['destination already exists', '该文件已经存在，请选择新文件名；原文件未被覆盖。'],
    ['stale editor', '编辑副本已变化，请重新打开导出设置。'],
    ['another export operation', '另一项导出正在运行，请稍后重试。'],
    ['source block is absent', '替换规则已过期，请重新预览兼容性。'],
    ['unavailable in the target', '替换方块不属于目标游戏版本，请重新选择。'],
    ['no visible blocks', '所选导出范围没有可见方块，请调整选区。'],
    ['position cannot be determined', '有实体无法安全定位，已停止裁剪导出，原数据未改动。'],
  ]
  return known.find(([part]) => text.includes(part))?.[1] ?? text
}
