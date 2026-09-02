import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Session } from '../session'
import { card, errorText, hint, input, label, primaryButton } from '../ui'

/**
 * 自分の企業の設定（受け入れ基準 B1・A4）。
 *
 * ここに2つ置く:
 *   - **企業名を変える。** 打ち間違えたまま作った生徒が直せないと、その名前で
 *     1つの授業を過ごすことになる
 *   - **パスワードの作り直し。** 仕組みはあったが、生徒が再発行コードを入れる
 *     場所がどこにも無かった。忘れたら先生に頼むしかなかった
 */

export function AccountScreen(props: {
  session?: Session
  onNeedLogin: () => void
  onRenamed: (name: string) => void
}) {
  const { t } = useTranslation()

  const [name, setName] = useState(props.session?.organizationName ?? '')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameProblem, setNameProblem] = useState<string | undefined>()
  const [nameDone, setNameDone] = useState(false)

  const [marketId, setMarketId] = useState(props.session?.marketId ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetErrorKey, setResetErrorKey] = useState<string | undefined>()
  const [newCode, setNewCode] = useState<string | undefined>()

  const rename = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!props.session) return
    setNameBusy(true)
    setNameProblem(undefined)
    setNameDone(false)

    const response = await api<{ organization_name: string }>('POST', '/store/organization', {
      body: { organization_name: name },
      token: props.session.token,
    })
    setNameBusy(false)

    if (!response.ok || !response.data) {
      // サーバーは「どういう問題か」だけを返す。文言はここで辞書から引く。
      setNameProblem(response.problem ?? 'empty')
      return
    }
    setNameDone(true)
    props.onRenamed(response.data.organization_name)
  }

  const reset = async (event: React.FormEvent) => {
    event.preventDefault()
    setResetBusy(true)
    setResetErrorKey(undefined)

    const response = await api<{ recovery_code: string }>('POST', '/store/recovery', {
      body: {
        market_id: marketId,
        recovery_code: code,
        new_password: password,
      },
    })
    setResetBusy(false)

    if (!response.ok || !response.data) {
      setResetErrorKey(response.errorKey ?? 'unknown')
      return
    }
    // 使った再発行コードは二度と使えない。新しいコードをここで一度だけ見せる。
    setNewCode(response.data.recovery_code)
    setCode('')
    setPassword('')
  }

  return (
    <div style={{ maxWidth: '520px' }}>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('account.title')}</h1>

      {props.session ? (
        <form onSubmit={rename} style={{ ...card, marginTop: 'var(--sp-4)' }}>
          <h2 style={{ fontSize: 'var(--text-h3)', marginTop: 0 }}>{t('account.nameTitle')}</h2>
          <p style={hint}>{t('account.nameLead')}</p>

          <label style={label} htmlFor="new-organization-name">
            {t('auth.organizationName')}
          </label>
          <input
            id="new-organization-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            required
            style={input}
          />
          <div style={hint}>{t('auth.organizationNameHint')}</div>

          {nameProblem && <p style={errorText}>{t(`nameProblem.${nameProblem}`)}</p>}
          {nameDone && <p style={{ color: 'var(--positive)' }}>{t('account.saved')}</p>}

          <button
            type="submit"
            disabled={nameBusy}
            style={{ ...primaryButton, marginTop: 'var(--sp-4)' }}
          >
            {nameBusy ? t('account.saving') : t('account.save')}
          </button>
        </form>
      ) : (
        <p style={hint}>
          {t('detail.loginToBuy')}{' '}
          <button
            type="button"
            onClick={props.onNeedLogin}
            style={{ ...primaryButton, marginLeft: 'var(--sp-2)' }}
          >
            {t('nav.login')}
          </button>
        </p>
      )}

      {/* ログインしていなくても使える。パスワードを忘れた人はログインできないため。 */}
      <form onSubmit={reset} style={{ ...card, marginTop: 'var(--sp-6)' }}>
        <h2 style={{ fontSize: 'var(--text-h3)', marginTop: 0 }}>{t('account.recoveryTitle')}</h2>
        <p style={hint}>{t('account.recoveryLead')}</p>

        <label style={label} htmlFor="recovery-market-id">
          {t('auth.marketId')}
        </label>
        <input
          id="recovery-market-id"
          value={marketId}
          onChange={(event) => setMarketId(event.target.value)}
          required
          className="numeric"
          style={input}
        />

        <label style={{ ...label, marginTop: 'var(--sp-3)' }} htmlFor="recovery-code">
          {t('account.recoveryCode')}
        </label>
        <input
          id="recovery-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          className="numeric"
          style={input}
        />

        <label style={{ ...label, marginTop: 'var(--sp-3)' }} htmlFor="recovery-password">
          {t('account.newPassword')}
        </label>
        <input
          id="recovery-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
          style={input}
        />
        <div style={hint}>{t('auth.passwordHint')}</div>

        {resetErrorKey && <p style={errorText}>{t(`errors.${resetErrorKey}`)}</p>}

        {newCode && (
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <p style={{ color: 'var(--positive)' }}>{t('account.resetDone')}</p>
            <div style={label}>{t('account.recoveryCode')}</div>
            <div className="numeric" style={{ fontSize: 'var(--text-h2)' }}>
              {newCode}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={resetBusy}
          style={{ ...primaryButton, marginTop: 'var(--sp-4)' }}
        >
          {t('account.reset')}
        </button>
      </form>
    </div>
  )
}
