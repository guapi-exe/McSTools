import {vanillaBlockNames, vanillaBlockTraditionalNames} from './vanilla-block-names.generated'

const legacyNames: Readonly<Record<string, string>> = {
  'minecraft:grass': 'minecraft:short_grass',
  'minecraft:grass_path': 'minecraft:dirt_path',
}
export function materialLanguage(locale: string): 'zh-CN' | 'zh-TW' | 'en' | 'ja' {
  if (['zh_tw', 'zh-TW', 'zh-Hant'].includes(locale)) return 'zh-TW'
  if (['zh', 'zh_cn', 'zh-CN', 'zh-Hans'].includes(locale)) return 'zh-CN'
  return locale === 'ja' ? 'ja' : 'en'
}
// Lookup normalization never changes the original ID used in the table/CSV.
export function materialName(value: string, locale = 'zh'): string {
  const language = materialLanguage(locale)
  const normalized = value.trim().toLowerCase().split(/[\[{]/u)[0].replace(/^block:/u, '')
  const id = normalized.includes(':') ? normalized : `minecraft:${normalized}`
  if (!id.startsWith('minecraft:')) return value
  const lookup = Object.prototype.hasOwnProperty.call(legacyNames, id) ? legacyNames[id] : id
  const names = language === 'zh-TW' ? vanillaBlockTraditionalNames : vanillaBlockNames
  if ((language === 'zh-CN' || language === 'zh-TW') && Object.prototype.hasOwnProperty.call(names, lookup)) return names[lookup]
  if (!Object.prototype.hasOwnProperty.call(vanillaBlockNames, lookup)) return value
  return id.slice('minecraft:'.length).replace(/_/g, ' ')
}
