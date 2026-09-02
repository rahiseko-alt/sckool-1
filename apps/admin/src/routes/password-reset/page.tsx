import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageShell } from '../../components/page-shell'
import { adminI18n } from '../../i18n'

/**
 * パスワードの初期化（要件36、受け入れ基準 A5）。
 *
 * **Market ID も再発行コードも無くした人のための最後の手段。**
 * この仕組みは「どの Market ID が誰か」を持っていないので、本人確認は教室で
 * 対面で行う前提。画面は操作を受け付けるだけ。
 *
 * 出てくる一時パスワードと再発行コードは**この一度しか表示されない**。
 * サーバーはハッシュしか持たないので、閉じたら二度と読めない。
 *
 * 文字列は辞書から引く（要件34、受け入れ基準 I1・J2）。
 */

declare const __BACKEND_URL__: string

const ALERT = '#b91c1c'
const CARD_BORDER = '1px solid rgba(0, 0, 0, 0.12)'

interface ResetResult {
  market_id: string
  temporary_password: string
  recovery_code: string
}

const field: React.CSSProperties = {
  padding: '10px 12px',
  border: CARD_BORDER,
  borderRadius: '6px',
  fontSize: '16px',
  minWidth: '220px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

const button: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '6px',
  border: 'none',
  background: '#2563eb',
  color: '#ffffff',
  fontSize: '15px',
  cursor: 'pointer',
}

const valueBox: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '22px',
  letterSpacing: '0.06em',
  padding: '10px 14px',
  background: '#f8fafc',
  border: CARD_BORDER,
  borderRadius: '6px',
  display: 'inline-block',
}

/**
 * 画面に残す知らせは**訳した文ではなく辞書の鍵で持つ**。
 *
 * 訳した文をそのまま持つと、あとから言語を切り替えても前の言語のまま残る
 * （実際にブラウザで確かめて見つけた）。
 */
interface Message {
  key: string
  params?: Record<string, string | number>
}

const PasswordResetPage = () => {
  const { t } = useTranslation()
  const [marketId, setMarketId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Message | undefined>()
  const [result, setResult] = useState<ResetResult | undefined>()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = marketId.trim()
    if (trimmed === '') {
      setError({ key: 'passwordReset.error.required' })
      setResult(undefined)
      return
    }

    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch(`${__BACKEND_URL__}/admin/accounts/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ market_id: trimmed }),
      })

      if (response.status === 404) {
        setResult(undefined)
        setError({
          key: 'passwordReset.error.notFound',
          params: { marketId: trimmed.toUpperCase() },
        })
        return
      }
      if (response.status === 401) {
        setResult(undefined)
        setError({ key: 'error.unauthorized' })
        return
      }
      if (!response.ok) {
        setResult(undefined)
        setError({ key: 'error.load', params: { status: response.status } })
        return
      }

      setResult((await response.json()) as ResetResult)
    } catch {
      setResult(undefined)
      setError({ key: 'error.offline' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* 間の空白は JSX 側で入れる。日本語以外は語の間に空白が要るので、
          辞書の文字列の端に持たせると（見えないので）消える。 */}
      <p style={{ opacity: 0.7, marginTop: '8px' }}>
        {t('passwordReset.lead')} <strong>{t('passwordReset.notice')}</strong>{' '}
        {t('passwordReset.detail')}
      </p>

      <form onSubmit={submit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '24px', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ opacity: 0.7 }}>{t('organizations.columns.marketId')}</span>
          <input
            name="market_id"
            aria-label={t('organizations.columns.marketId')}
            value={marketId}
            onChange={(event) => setMarketId(event.target.value)}
            placeholder={t('passwordReset.marketIdPlaceholder')}
            style={field}
          />
        </label>
        <button type="submit" disabled={busy} style={{ ...button, opacity: busy ? 0.6 : 1 }}>
          {busy ? t('passwordReset.submitting') : t('passwordReset.submit')}
        </button>
      </form>

      {error && (
        <p style={{ color: ALERT, marginTop: '16px' }} data-testid="password-reset-error">
          {t(error.key, error.params)}
        </p>
      )}

      {result && (
        <div
          data-testid="password-reset-result"
          style={{ marginTop: '32px', padding: '20px', border: CARD_BORDER, borderRadius: '8px' }}
        >
          <h2 style={{ fontSize: '18px', marginTop: 0 }}>{t('passwordReset.result.title')}</h2>
          <p style={{ color: ALERT }}>
            <strong>{t('passwordReset.result.warning')}</strong>
          </p>

          <dl style={{ display: 'grid', gap: '16px', margin: 0 }}>
            <div>
              <dt style={{ opacity: 0.7, marginBottom: '6px' }}>
                {t('organizations.columns.marketId')}
              </dt>
              <dd style={{ margin: 0 }}>
                <span style={valueBox}>{result.market_id}</span>
              </dd>
            </div>
            <div>
              <dt style={{ opacity: 0.7, marginBottom: '6px' }}>
                {t('passwordReset.result.temporaryPassword')}
              </dt>
              <dd style={{ margin: 0 }}>
                <span style={valueBox} data-testid="temporary-password">
                  {result.temporary_password}
                </span>
              </dd>
            </div>
            <div>
              <dt style={{ opacity: 0.7, marginBottom: '6px' }}>
                {t('passwordReset.result.recoveryCode')}
              </dt>
              <dd style={{ margin: 0 }}>
                <span style={valueBox} data-testid="recovery-code">
                  {result.recovery_code}
                </span>
              </dd>
            </div>
          </dl>

          <p style={{ opacity: 0.7, marginBottom: 0 }}>{t('passwordReset.result.next')}</p>
        </div>
      )}
    </>
  )
}

const PasswordResetRoute = () => (
  <PageShell titleKey="passwordReset.title">
    <PasswordResetPage />
  </PageShell>
)

/** 左のメニューに出す。文言は起動時の言語で固定される（他のページと同じ）。 */
export const config = {
  label: adminI18n.t('passwordReset.title'),
}

export default PasswordResetRoute
