import i18next from 'i18next'

import en from './en.json'
import ja from './ja-JP.json'
import ne from './ne-NP.json'
import th from './th-TH.json'
import vi from './vi-VN.json'
import zh from './zh-CN.json'
import { DEFAULT_LOCALE, isLocaleCode, LOCALE_STORAGE_KEY, type LocaleCode } from './locales'

/**
 * 先生が見る画面の翻訳（要件34、受け入れ基準 I1・I2）。
 *
 * **Mercur の管理画面が持つ i18next には相乗りできない。** 相手は言語の一覧を
 * 自分の辞書から作っており（`supportedLngs`）、そこに無い言語へは切り替えられない。
 * ネパール語は一覧に無く、日本語・中国語・ベトナム語・タイ語も `ja` `zhCN` のように
 * 綴りが違う。そこで**自分たちの画面用に別の i18next を1つ立てる**
 * （生徒の画面と同じ作り。`docs/decisions.md`「32.」「36.」）。
 *
 * 相手の既定の instance は奪わない（`initReactI18next` を呼ばない）。
 * 呼ぶと Mercur 側の画面文字列がこちらの辞書に差し替わる。
 * 自分たちのページだけを `I18nextProvider` で包んで使う。
 *
 * `i18next` と `react-i18next` はリポジトリ直下の `package.json` が持っている
 * （`@mercurjs/dashboard-sdk` の Vite 設定が同じものを1つに束ねる指定をしているため、
 * ここで別に入れると二重に読み込まれる）。
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
 * `localStorage` に触れるだけで例外が出る。ここで落とすと先生は画面を開けなくなる。
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

/** 先生の画面が使う i18next。Mercur のものとは別物。 */
export const adminI18n = i18next.createInstance()

void adminI18n.init({
  resources,
  lng: readSavedLocale(),
  // 訳が無いときは日本語を出す。キーがそのまま出るよりは読める。
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
})

/**
 * Mercur の管理画面へ渡す辞書（`@mercurjs/dashboard-sdk` がこの既定の書き出しを読む）。
 *
 * 相手は `en` `ja` `zhCN` … という綴りしか受け取れないので、**英語だけを渡す**。
 * こちらのキーも混ざるが、相手の持つキーとは名前が重ならないので影響しない。
 */
const i18nResources = {
  en: {
    translation: en,
  },
}

export default i18nResources
