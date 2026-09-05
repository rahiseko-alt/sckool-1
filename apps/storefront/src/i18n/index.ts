import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './en.json'
import ja from './ja-JP.json'
import ne from './ne-NP.json'
import th from './th-TH.json'
import vi from './vi-VN.json'
import zh from './zh-CN.json'
import { DEFAULT_LOCALE, isLocaleCode, LOCALE_STORAGE_KEY, type LocaleCode } from './locales'

/**
 * 画面文字列の翻訳（受け入れ基準 I1・I2）。
 *
 * Medusa の Translation Module は使わない（`docs/decisions.md`「32.」）。
 * 辞書は JSON ファイルに置き、`scripts/check-i18n-keys.mjs` で過不足を機械で調べる。
 */

const resources = {
  'ja-JP': { translation: ja },
  en: { translation: en },
  'zh-CN': { translation: zh },
  'vi-VN': { translation: vi },
  'ne-NP': { translation: ne },
  'th-TH': { translation: th },
}

/**
 * 前に選んだ言語を読む。
 *
 * **読めなくても画面は出す。** ブラウザの設定で保存が禁じられていると
 * `localStorage` に触れるだけで例外が出る。ここで落とすと、その生徒は
 * 市場そのものを開けなくなる。
 */
export function readSavedLocale(): LocaleCode {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocaleCode(saved) ? saved : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

/** 選んだ言語を覚える。覚えられなくても画面は動かす。 */
export function saveLocale(locale: LocaleCode): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // 保存できないだけ。次に開いたときに既定へ戻る。
  }
}

void i18next.use(initReactI18next).init({
  resources,
  lng: readSavedLocale(),
  // 訳が無いときは日本語を出す。キーがそのまま出るよりは読める。
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
})

export default i18next
