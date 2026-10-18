import { createI18n } from 'vue-i18n'
import en from './en'
import ja from './ja'
import zh from './zh_cn.ts'
import zh_tw from './zh_tw.ts'
import {desktopMessages} from './desktop'

const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'en',
  messages: {
    en: {...en, desktop: desktopMessages.en},
    ja: {...ja, desktop: desktopMessages.ja},
    zh: {...zh, desktop: desktopMessages.zh},
    zh_tw: {...zh_tw, desktop: desktopMessages.zh_tw}
  }
})

export default i18n
