import {invoke} from '@tauri-apps/api/core'
import type {SchematicPreviewData, Size} from './schematic_data'
export type EditorPoint = [number, number, number]
export interface EditRegion { min: EditorPoint; max: EditorPoint }
export type EditOperation =
  | {kind: 'replace'; original_id: string; replacement_id: string; region: EditRegion | null; preserve_properties: boolean}
  | {kind: 'crop' | 'crop_outside'; region: EditRegion}
export type EditorAction = {action: 'edit'; operation: EditOperation} | {action: 'undo' | 'reset'}
export interface EditorInfo {
  session_id: number; source_id: number; revision: number; game_version: string
  source_data_version: number | null; source_name: string; source_format: number; source_subtype: number
  size: Size; undo_steps: number; modified: boolean
}
export interface EditorPreview { info: EditorInfo; candidate_id: number | null; preview: SchematicPreviewData }
export type PickMode = 'block' | 'first' | 'second' | null
export interface WorkPlane { axis: 0 | 1 | 2; coordinate: number }
export const openEditor = (id: number) => invoke<EditorPreview>('open_blueprint_editor', {id})
export const closeEditor = (sessionId: number) => invoke<void>('close_blueprint_editor', {sessionId})
export const stageEdit = (info: EditorInfo, action: EditorAction) => invoke<EditorPreview>('stage_blueprint_edit', {
  sessionId: info.session_id, revision: info.revision, action,
})
export const commitEdit = (info: EditorInfo, candidateId: number) => invoke<EditorInfo>('commit_blueprint_edit', {
  sessionId: info.session_id, revision: info.revision, candidateId,
})
export const cancelEdit = (info: EditorInfo, candidateId: number) => invoke<void>('cancel_blueprint_edit', {
  sessionId: info.session_id, candidateId,
})
