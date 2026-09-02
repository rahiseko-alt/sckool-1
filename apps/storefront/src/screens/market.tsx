import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Listing } from './listing-detail'
import { card, errorText, hint, money, primaryButton, quietButton } from '../ui'

/**
 * 市場一覧（受け入れ基準 C2）。
 *
 * 買えない商品も並べ、**理由を添える**。消してしまうと、生徒は
 * 「自分の商品が売れないのは期間の設定のせいだ」と気づけない。
 */
export function MarketScreen(props: { onOpen: (listingId: string) => void }) {
  const { t } = useTranslation()
  const [listings, setListings] = useState<Listing[] | undefined>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setFailed(false)
      const response = await api<{ listings: Listing[] }>('GET', '/store/listings')
      if (cancelled) return
      if (!response.ok || !response.data) {
        setFailed(true)
        return
      }
      setListings(response.data.listings)
    })()
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('market.title')}</h1>
      <p style={hint}>{t('market.subtitle')}</p>

      {failed && (
        <p>
          <span style={errorText}>{t('market.loadError')}</span>{' '}
          <button type="button" onClick={() => setAttempt((value) => value + 1)} style={quietButton}>
            {t('market.retry')}
          </button>
        </p>
      )}

      {!failed && listings === undefined && <p style={hint}>{t('market.loading')}</p>}

      {listings !== undefined && (
        <>
          <p className="numeric" style={hint}>
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
              <article key={listing.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
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
                  <div style={hint}>
                    {t('market.seller')}: {listing.organization_name}
                  </div>
                  <div className="numeric" style={{ marginTop: 'var(--sp-2)' }}>
                    {money(listing.price, t('money.unit'))}
                  </div>
                  <div className="numeric" style={hint}>
                    {t('market.remaining')}: {listing.available_quantity}
                  </div>

                  {!listing.can_buy && (
                    // 押せなくするだけでは、なぜ買えないのか分からない。
                    <div
                      style={{
                        marginTop: 'var(--sp-2)',
                        padding: 'var(--sp-1) var(--sp-2)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        fontSize: 'var(--text-small)',
                        textAlign: 'center',
                      }}
                    >
                      {t(`unavailable.${listing.unavailable_reason ?? 'sold_out'}`)}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => props.onOpen(listing.id)}
                    style={{ ...primaryButton, marginTop: 'var(--sp-3)', width: '100%' }}
                  >
                    {t('market.detail')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
