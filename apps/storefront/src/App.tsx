import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from './components/language-switcher'
import { ListingDetailScreen } from './screens/listing-detail'
import { LogInScreen } from './screens/log-in'
import { MarketScreen } from './screens/market'
import { QuizzesScreen } from './screens/quizzes'
import { RankingScreen } from './screens/ranking'
import { SignUpScreen } from './screens/sign-up'
import { clearSession, readSession, saveSession, type Session } from './session'
import { hint, linkButton, quietButton } from './ui'

/**
 * 生徒が見る画面（受け入れ基準 I1・I2）。
 *
 * **画面に日本語を直接書かない。** 全ての文字列は辞書から引く。1つでも直接書くと、
 * その行だけ切り替わらないまま残り、日本語以外の生徒には読めない箇所になる。
 *
 * 画面の切り替えは状態だけで行う。URL は分けていない `[曖昧]`。
 * 分ける必要が出たら（授業中に商品の URL を共有したい、など）そのとき入れる。
 */

type Screen = 'market' | 'listing' | 'quizzes' | 'ranking' | 'login' | 'signUp'

export default function App() {
  const { t } = useTranslation()
  const [screen, setScreen] = useState<Screen>('market')
  const [listingId, setListingId] = useState<string | undefined>()
  const [session, setSession] = useState<Session | undefined>(readSession)

  const startSession = (next: Session) => {
    saveSession(next)
    setSession(next)
    setScreen('market')
  }

  const navItems: { key: Screen; label: string }[] = [
    { key: 'market', label: t('nav.market') },
    { key: 'quizzes', label: t('nav.quizzes') },
    { key: 'ranking', label: t('nav.ranking') },
  ]

  return (
    <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: 'var(--sp-4)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--sp-4)',
          paddingBottom: 'var(--sp-4)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          type="button"
          onClick={() => setScreen('market')}
          style={{ ...linkButton, textAlign: 'left', color: 'var(--text)' }}
        >
          <div style={{ fontSize: 'var(--text-h2)', fontWeight: 600 }}>{t('app.name')}</div>
          <div style={hint}>{t('app.tagline')}</div>
        </button>

        {/* 言語の切替は右上に常設する。ログインしていなくても切り替えられる。 */}
        <LanguageSwitcher />
      </header>

      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          padding: 'var(--sp-3) 0',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setScreen(item.key)}
            style={{
              ...linkButton,
              fontWeight: screen === item.key ? 600 : 400,
              color: screen === item.key ? 'var(--accent)' : 'var(--text)',
            }}
          >
            {item.label}
          </button>
        ))}

        <span style={{ flex: 1 }} />

        {session ? (
          <>
            <span style={hint}>
              {t('auth.loggedInAs')}: {session.organizationName}
            </span>
            <button
              type="button"
              onClick={() => {
                clearSession()
                setSession(undefined)
                setScreen('market')
              }}
              style={quietButton}
            >
              {t('auth.logOut')}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setScreen('login')} style={linkButton}>
              {t('nav.login')}
            </button>
            <button type="button" onClick={() => setScreen('signUp')} style={quietButton}>
              {t('nav.signUp')}
            </button>
          </>
        )}
      </nav>

      <main style={{ paddingTop: 'var(--sp-6)' }}>
        {screen === 'market' && (
          <MarketScreen
            onOpen={(id) => {
              setListingId(id)
              setScreen('listing')
            }}
          />
        )}

        {screen === 'listing' && listingId && (
          <ListingDetailScreen
            listingId={listingId}
            {...(session ? { session } : {})}
            onBack={() => setScreen('market')}
            onNeedLogin={() => setScreen('login')}
          />
        )}

        {screen === 'quizzes' && (
          <QuizzesScreen
            {...(session ? { session } : {})}
            onNeedLogin={() => setScreen('login')}
          />
        )}

        {screen === 'ranking' && <RankingScreen />}

        {screen === 'login' && (
          <div>
            <LogInScreen onDone={startSession} />
            <p style={{ marginTop: 'var(--sp-4)' }}>
              <button type="button" onClick={() => setScreen('signUp')} style={linkButton}>
                {t('nav.signUp')}
              </button>
            </p>
          </div>
        )}

        {screen === 'signUp' && (
          <div>
            <SignUpScreen onDone={startSession} />
            <p style={{ marginTop: 'var(--sp-4)' }}>
              <button type="button" onClick={() => setScreen('login')} style={linkButton}>
                {t('nav.login')}
              </button>
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
