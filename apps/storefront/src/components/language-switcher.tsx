import { useTranslation } from 'react-i18next'

import { saveLocale } from '../i18n'
import { isLocaleCode, LOCALES } from '../i18n/locales'

/**
 * 言語の切替（受け入れ基準 I1）。
 *
 * **全画面の右上に常設し、ログインしていなくても切り替えられる。**
 * 日本語が読めない生徒は、ログイン画面にたどり着く前に切り替える必要がある。
 * 「ログインしてから設定で変える」形にすると、そこまで進めない。
 *
 * 選択はブラウザに残す。毎回選び直すのは、6言語のうち5つの生徒にとって
 * 毎回の手間になる。
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
      {/* 読めない言語で「言語」と書いてあっても意味が無いので、地球の記号を添える。 */}
      <span aria-hidden="true">🌐</span>
      <select
        aria-label="Language"
        value={i18n.language}
        onChange={(event) => {
          const next = event.target.value
          if (!isLocaleCode(next)) return
          void i18n.changeLanguage(next)
          saveLocale(next)
        }}
        style={{
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)',
          color: 'var(--text)',
          font: 'inherit',
          padding: 'var(--sp-1) var(--sp-2)',
        }}
      >
        {LOCALES.map((locale) => (
          // 選択肢はその言語自身の表記で出す。読めない言語の名前では選べない。
          <option key={locale.code} value={locale.code}>
            {locale.label}
          </option>
        ))}
      </select>
    </label>
  )
}
