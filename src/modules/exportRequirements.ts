import type {RequirementStatistic} from './requirements'
import {materialsCsv} from './materials/materials_csv'

export function exportRequirementsStatsToCsv(name: string, stats: RequirementStatistic[],
  filename = `${name}_requirements.csv`, locale = 'zh') {
  const url = URL.createObjectURL(new Blob([materialsCsv(stats, locale)], {type: 'text/csv;charset=utf-8;'}))
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  link.hidden = true
  document.body.appendChild(link)
  try { link.click() }
  finally {
    link.remove()
    // Allow the browser to consume the download before releasing its buffer.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
