export type AppLocale = 'zh' | 'zh_tw' | 'en' | 'ja'

/** Keep stored historical/BCP-47 values aligned with our message and select keys. */
export function normalizeAppLocale(value: unknown): AppLocale {
  if (typeof value !== 'string') return 'zh'
  const locale = value.trim().replace(/_/g, '-').toLowerCase()
  if (['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo'].includes(locale)) return 'zh_tw'
  if (locale === 'ja' || locale.startsWith('ja-')) return 'ja'
  if (locale === 'en' || locale.startsWith('en-')) return 'en'
  return 'zh'
}
