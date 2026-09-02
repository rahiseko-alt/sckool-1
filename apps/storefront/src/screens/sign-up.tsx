import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Session } from '../session'
import { card, errorText, hint, input, label, primaryButton } from '../ui'

/**
 * 企業をつくる（受け入れ基準 A1・B1）。
 *
 * **聞くのは企業名とパスワードだけ。** 氏名もメールも学年も聞かない（要件35）。
 * 入力欄を1つでも足すと、その分だけ「誰の企業か」がデータから辿れるようになる。
 *
 * ID と再発行コードは**この画面でしか出さない**。あとから読み出す経路は無い。
 */

interface Created {
  market_id: string
  recovery_code: string
  organization_name: string
}

export function SignUpScreen(props: { onDone: (session: Session) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<string | undefined>()
  const [created, setCreated] = useState<Created | undefined>()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrorKey(undefined)

    const result = await api<Created>('POST', '/store/accounts', {
      body: { organization_name: name, password },
    })
    setBusy(false)

    if (!result.ok || !result.data) {
      setErrorKey(result.errorKey ?? 'unknown')
      return
    }
    setCreated(result.data)
  }

  /** 控えたあとにログインまで済ませる。もう一度打たせる意味が無い。 */
  const finish = async () => {
    if (!created) return
    setBusy(true)
    const login = await api<{ token: string }>('POST', '/auth/customer/emailpass', {
      body: { email: created.market_id, password },
    })
    setBusy(false)
    if (!login.ok || !login.data) {
      setErrorKey(login.errorKey ?? 'unknown')
      return
    }
    props.onDone({
      marketId: created.market_id,
      organizationName: created.organization_name,
      token: login.data.token,
    })
  }

  if (created) {
    return (
      <div style={{ ...card, maxWidth: '480px' }}>
        <h1 style={{ fontSize: 'var(--text-h2)', marginTop: 0 }}>{t('auth.credentialsTitle')}</h1>
        <p style={hint}>{t('auth.credentialsLead')}</p>

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <div style={label}>{t('auth.marketId')}</div>
          <div className="numeric" style={{ fontSize: 'var(--text-h2)' }}>
            {created.market_id}
          </div>
        </div>

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <div style={label}>{t('auth.recoveryCode')}</div>
          <div className="numeric" style={{ fontSize: 'var(--text-h2)' }}>
            {created.recovery_code}
          </div>
          <div style={hint}>{t('auth.recoveryCodeHint')}</div>
        </div>

        {errorKey && <p style={errorText}>{t(`errors.${errorKey}`)}</p>}

        <button
          type="button"
          onClick={finish}
          disabled={busy}
          style={{ ...primaryButton, marginTop: 'var(--sp-6)', width: '100%' }}
        >
          {t('auth.saved')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ ...card, maxWidth: '480px' }}>
      <h1 style={{ fontSize: 'var(--text-h2)', marginTop: 0 }}>{t('auth.signUpTitle')}</h1>
      <p style={hint}>{t('auth.signUpLead')}</p>

      <div style={{ marginTop: 'var(--sp-4)' }}>
        <label style={label} htmlFor="organization-name">
          {t('auth.organizationName')}
        </label>
        <input
          id="organization-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          required
          style={input}
        />
        <div style={hint}>{t('auth.organizationNameHint')}</div>
      </div>

      <div style={{ marginTop: 'var(--sp-4)' }}>
        <label style={label} htmlFor="password">
          {t('auth.password')}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
          style={input}
        />
        <div style={hint}>{t('auth.passwordHint')}</div>
      </div>

      {errorKey && <p style={errorText}>{t(`errors.${errorKey}`)}</p>}

      <button
        type="submit"
        disabled={busy}
        style={{ ...primaryButton, marginTop: 'var(--sp-6)', width: '100%' }}
      >
        {busy ? t('auth.creating') : t('auth.createAccount')}
      </button>
    </form>
  )
}
