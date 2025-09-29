import { createI18n } from 'vue-i18n'
import zh from './locales/zh'
import en from './locales/en'

// 获取浏览器语言设置，默认中文
const getDefaultLocale = (): string => {
  const savedLocale = localStorage.getItem('locale')
  if (savedLocale) {
    return savedLocale
  }

  const browserLang = navigator.language.toLowerCase()
  if (browserLang.includes('en')) {
    return 'en'
  }

  // 默认返回中文
  return 'zh'
}

const i18n = createI18n({
  legacy: false, // 使用 Composition API
  locale: getDefaultLocale(),
  fallbackLocale: 'zh', // 回退语言为中文
  messages: {
    zh,
    en
  }
})

export default i18n

// 切换语言的工具函数
export const setLocale = (locale: string) => {
  i18n.global.locale.value = locale as any
  localStorage.setItem('locale', locale)
  document.documentElement.lang = locale
}

// 获取当前语言
export const getCurrentLocale = () => {
  return i18n.global.locale.value
}

// 支持的语言列表
export const supportedLocales = [
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'en', name: 'English', flag: '🇺🇸' }
]