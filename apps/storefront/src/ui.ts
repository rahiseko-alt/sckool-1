import type { CSSProperties } from 'react'

/**
 * 画面の共通の見た目。値は `styles/tokens.css` の変数を指すだけにする。
 *
 * **色や余白の数値をここに書かない。** 書くと `docs/design.md` との突き合わせ
 * （`src/design-tokens.test.ts`）から外れ、片方だけ変わっても誰も気づかない。
 */

export const card: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-card)',
  background: 'var(--bg)',
  padding: 'var(--sp-4)',
}

export const primaryButton: CSSProperties = {
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)',
  color: 'var(--accent-text)',
  font: 'inherit',
  fontWeight: 600,
  padding: 'var(--sp-2) var(--sp-4)',
  cursor: 'pointer',
}

export const quietButton: CSSProperties = {
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg)',
  color: 'var(--text)',
  font: 'inherit',
  padding: 'var(--sp-2) var(--sp-4)',
  cursor: 'pointer',
}

export const linkButton: CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'var(--accent)',
  font: 'inherit',
  padding: 0,
  cursor: 'pointer',
}

export const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-subtle)',
  color: 'var(--text)',
  font: 'inherit',
  padding: 'var(--sp-2) var(--sp-3)',
}

export const label: CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginBottom: 'var(--sp-1)',
}

export const hint: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-small)',
}

export const errorText: CSSProperties = {
  color: 'var(--negative)',
}

/** 金額の表示。桁を揃えないと、並んだときに読み違える。 */
export function money(amount: number, unit: string): string {
  return `${amount.toLocaleString()} ${unit}`
}
