import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from './components/language-switcher'

declare const __BACKEND_URL__: string
declare const __PUBLISHABLE_KEY__: string

/**
 * 生徒が見る画面。いまは市場一覧だけ（受け入れ基準 C2・I1）。
 *
 * **画面に日本語を直接書かない。** 全ての文字列は辞書から引く。
 * 1つでも直接書くと、その行だけ切り替わらないまま残り、
 * 日本語以外の生徒には読めない箇所になる（受け入れ基準 I2）。
 */

interface Listing {
  id: string
  title: string
  description: string
  price: number
  available_quantity: number
  image_url: string
  organization_name: string | null
  can_buy: boolean
  unavailable_reason?: 'not_started' | 'ended' | 'sold_out'
}

export default function App() {
  const { t } = useTranslation()
  const [listings, setListings] = useState<Listing[] | undefined>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setFailed(false)
      try {
        const response = await fetch(`${__BACKEND_URL__}/store/listings`, {
          headers: { 'x-publishable-api-key': __PUBLISHABLE_KEY__ },
        })
        if (cancelled) return
        if (!response.ok) {
          setFailed(true)
          return
        }
        const body = (await response.json()) as { listings: Listing[] }
        setListings(body.listings)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: 'var(--sp-4)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-4)',
          paddingBottom: 'var(--sp-4)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <div style={{ fontSize: 'var(--text-h2)', fontWeight: 600 }}>{t('app.name')}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-small)' }}>
            {t('app.tagline')}
          </div>
        </div>
        {/* 切替は右上に常設する（受け入れ基準 I1）。 */}
        <LanguageSwitcher />
      </header>

      <main style={{ paddingTop: 'var(--sp-6)' }}>
        <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('market.title')}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('market.subtitle')}</p>

        {failed && (
          <p>
            <span style={{ color: 'var(--negative)' }}>{t('market.loadError')}</span>{' '}
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              style={{
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg)',
                color: 'var(--text)',
                font: 'inherit',
                padding: 'var(--sp-1) var(--sp-3)',
                cursor: 'pointer',
              }}
            >
              {t('market.retry')}
            </button>
          </p>
        )}

        {!failed && listings === undefined && (
          <p style={{ color: 'var(--text-muted)' }}>{t('market.loading')}</p>
        )}

        {listings !== undefined && (
          <>
            <p className="numeric" style={{ color: 'var(--text-muted)' }}>
              {t('market.count', { count: listings.length })}
            </p>

            {listings.length === 0 && <p>{t('market.empty')}</p>}

            <div
              style={{
                display: 'grid',
                // 幅が狭い画面では1列になる。横スクロールを出さない（受け入れ基準 J3）。
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 'var(--sp-4)',
              }}
            >
              {listings.map((listing) => (
                <article
                  key={listing.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-card)',
                    overflow: 'hidden',
                    background: 'var(--bg)',
                  }}
                >
                  <img
                    src={listing.image_url}
                    alt=""
                    style={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      background: 'var(--bg-subtle)',
                      display: 'block',
                    }}
                  />
                  <div style={{ padding: 'var(--sp-3)' }}>
                    <div style={{ fontWeight: 600 }}>{listing.title}</div>
                    <div
                      style={{ color: 'var(--text-muted)', fontSize: 'var(--text-small)' }}
                    >
                      {t('market.seller')}: {listing.organization_name}
                    </div>
                    <div className="numeric" style={{ marginTop: 'var(--sp-2)' }}>
                      {listing.price.toLocaleString()} {t('money.unit')}
                    </div>
                    <div
                      className="numeric"
                      style={{ color: 'var(--text-muted)', fontSize: 'var(--text-small)' }}
                    >
                      {t('market.remaining')}: {listing.available_quantity}
                    </div>

                    {listing.can_buy ? (
                      <button
                        type="button"
                        style={{
                          marginTop: 'var(--sp-3)',
                          width: '100%',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--accent)',
                          color: 'var(--accent-text)',
                          font: 'inherit',
                          padding: 'var(--sp-2)',
                          cursor: 'pointer',
                        }}
                      >
                        {t('market.buy')}
                      </button>
                    ) : (
                      // 押せなくするだけでは、なぜ買えないのか分からない。理由を出す。
                      <div
                        style={{
                          marginTop: 'var(--sp-3)',
                          padding: 'var(--sp-2)',
                          textAlign: 'center',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-subtle)',
                          color: 'var(--text-muted)',
                          fontSize: 'var(--text-small)',
                        }}
                      >
                        {t(`unavailable.${listing.unavailable_reason ?? 'sold_out'}`)}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
