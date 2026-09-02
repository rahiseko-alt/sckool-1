/**
 * 管理画面が対応する言語（要件34、受け入れ基準 I1・I2）。
 *
 * **生徒の画面（`apps/storefront/src/i18n/locales.ts`）と同じ6言語にする。**
 * 片方だけ言語が増えると、先生と生徒で見えるものが食い違う。
 * 同じかどうかは `keys.test.ts` が突き合わせるので、増やすときは両方に足す。
 *
 * 生徒の画面から import しないのは、管理画面だけを単体でビルドできるようにするため。
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

/** 既定の言語。授業は日本語で行うので、先生の画面も日本語から始める。 */
export const DEFAULT_LOCALE: LocaleCode = 'ja-JP'

/**
 * ブラウザに選択を覚えさせるときの名前。
 *
 * Mercur の管理画面自身は `lng` という名前で言語を覚えている。
 * 同じ名前を使うと、こちらの6言語で相手の設定を壊すので別の名前にする。
 */
export const LOCALE_STORAGE_KEY = 'sckool.admin.locale'

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && LOCALES.some((locale) => locale.code === value)
}
