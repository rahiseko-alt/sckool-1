/**
 * 対応する言語（要件34、受け入れ基準 I1・I2）。
 *
 * **ここが言語の正本。** 増やすときはこの配列に足し、辞書ファイルを1つ作る。
 * `scripts/check-i18n-keys.mjs` はこの配列を読んで、辞書の過不足を調べる。
 *
 * 言語名は**その言語自身の表記**にする。読めない言語で「日本語」と書かれていても
 * 自分の言語を選べない。
 */
export const LOCALES = [
  { code: 'ja-JP', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'vi-VN', label: 'Tiếng Việt' },
  { code: 'ne-NP', label: 'नेपाली' },
  { code: 'th-TH', label: 'ไทย' },
] as const

export type LocaleCode = (typeof LOCALES)[number]['code']

/**
 * 既定の言語。
 *
 * 授業は日本語で行うが、**画面の既定は日本語のまま**にする。
 * 日本語が読めない生徒は自分で切り替える。切替は右上に常設してある（受け入れ基準 I1）。
 */
export const DEFAULT_LOCALE: LocaleCode = 'ja-JP'

/** ブラウザに選択を覚えさせるときの名前。 */
export const LOCALE_STORAGE_KEY = 'sckool.locale'

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && LOCALES.some((locale) => locale.code === value)
}
