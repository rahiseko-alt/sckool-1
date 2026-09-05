import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Session } from '../session'
import { card, errorText, hint, input, label, primaryButton } from '../ui'

/**
 * ログイン（受け入れ基準 A2・A6）。
 *
 * **ID が無い場合とパスワードが違う場合で、同じ文言を出す。** 分けると
 * 「その ID は存在する」と教えることになり、総当たりの手がかりを与える。
 * 判定はサーバーが行い、画面は返ってきた合図を訳して出すだけ。
 */
export function LogInScreen(props: { onDone: (session: Session) => void }) {
  const { t } = useTranslation()
  const [marketId, setMarketId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<string | undefined>()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrorKey(undefined)

    const login = await api<{ token: string }>('POST', '/auth/customer/emailpass', {
      body: { email: marketId.trim().toUpperCase(), password },
    })
    if (!login.ok || !login.data) {
      setBusy(false)
      setErrorKey(login.errorKey ?? 'unknown')
      return
    }

    // 企業名は画面に出すために取る。数字はダッシュボードが持つ。
    const dashboard = await api<{ organization_name: string }>('GET', '/store/dashboard', {
      token: login.data.token,
    })
    setBusy(false)

    props.onDone({
      marketId: marketId.trim().toUpperCase(),
      organizationName: dashboard.data?.organization_name ?? '',
      token: login.data.token,
    })
  }

  return (
    <form onSubmit={submit} style={{ ...card, maxWidth: '420px' }}>
      <h1 style={{ fontSize: 'var(--text-h2)', marginTop: 0 }}>{t('auth.loginTitle')}</h1>

      <div style={{ marginTop: 'var(--sp-4)' }}>
        <label style={label} htmlFor="market-id">
          {t('auth.marketId')}
        </label>
        <input
          id="market-id"
          value={marketId}
          onChange={(event) => setMarketId(event.target.value)}
          required
          autoCapitalize="characters"
          className="numeric"
          style={input}
        />
      </div>

      <div style={{ marginTop: 'var(--sp-4)' }}>
        <label style={label} htmlFor="login-password">
          {t('auth.password')}
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          style={input}
        />
      </div>

      {/* ID の有無を漏らさないため、失敗の理由は1種類しか出さない。 */}
      {errorKey && <p style={errorText}>{t(`errors.${errorKey}`)}</p>}

      <button
        type="submit"
        disabled={busy}
        style={{ ...primaryButton, marginTop: 'var(--sp-6)', width: '100%' }}
      >
        {busy ? t('auth.loggingIn') : t('auth.logIn')}
      </button>

      <p style={{ ...hint, marginBottom: 0 }}>{t('auth.recoveryCodeHint')}</p>
    </form>
  )
}
