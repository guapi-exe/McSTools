import { createI18n } from 'vue-i18n'
import en from './en'
import ja from './ja'
import zh from './zh_cn.ts'
import zh_tw from './zh_tw.ts'

const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'en',
  messages: {
    en,
    ja,
    zh,
    zh_tw
  }
})

export default i18n
