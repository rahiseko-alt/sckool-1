import { useTranslation } from 'react-i18next'

import { saveLocale } from '../i18n'
import { isLocaleCode, LOCALES } from '../i18n/locales'

/**
 * 言語の切替（受け入れ基準 I1）。
 *
 * **先生が見る3つの画面の右上に常設する。** 先生も日本語だけとは限らないし、
 * 生徒の画面と同じ位置に置けば、どちらを見ていても同じ操作で切り替えられる。
 *
 * 選択はブラウザに残す。毎回選び直すのは手間になる。
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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
          border: '1px solid rgba(0, 0, 0, 0.2)',
          borderRadius: '6px',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          padding: '4px 8px',
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
