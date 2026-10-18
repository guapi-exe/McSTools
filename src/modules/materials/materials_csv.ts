import type {RequirementStatistic} from '../requirements'
import {materialLanguage, materialName} from './block_names'

export function csvCell(value: string | number): string {
  const raw = String(value)
  // Spreadsheet parsers can discard whitespace/control characters before a
  // formula. Force text without dropping any of the original user-supplied ID.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}
export function materialsCsv(items: readonly RequirementStatistic[], locale = 'zh'): string {
  const language = materialLanguage(locale)
  const headers = language === 'zh-CN' ? ['方块 ID', '材料名称', '数量', '组数（64个）', '余数', '占比（%）']
    : language === 'zh-TW' ? ['方塊 ID', '材料名稱', '數量', '組數（64個）', '餘數', '占比（%）']
    : language === 'ja' ? ['ブロック ID', '素材名', '数量', 'スタック（64個）', '余り', '割合（%）']
    : ['Block ID', 'Name', 'Count', 'Stacks (64)', 'Remainder', 'Percentage (%)']
  const rows = [headers, ...items.map(item => [item.id, materialName(item.id, locale), item.count,
    Math.floor(item.count / 64), item.count % 64, item.percentage.toFixed(3)])]
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`
}
