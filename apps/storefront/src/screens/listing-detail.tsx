import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import { LOCALES } from '../i18n/locales'
import type { Session } from '../session'
import { card, errorText, hint, label, money, primaryButton, quietButton } from '../ui'

/**
 * 商品の詳細と購入（受け入れ基準 C1・C2・D1〜D4）。
 *
 * 買えないときは**理由を必ず出す**。押せなくするだけでは、なぜ買えないのかが
 * 分からず、生徒は自分の商品の何を直せばよいかも学べない。
 */

export interface Listing {
  id: string
  title: string
  description: string
  target_customer: string
  problem_solved: string
  price: number
  available_quantity: number
  image_url: string
  sale_starts_at: string
  sale_ends_at: string
  organization_name: string | null
  can_buy: boolean
  unavailable_reason?: 'not_started' | 'ended' | 'sold_out'
  /** 訳で出しているとき、その言語。原文のときは付かない（受け入れ基準 I3）。 */
  translated_from?: string
}

interface Purchased {
  title: string
  seller_name: string | null
  balance: { normal: number; bonus: number; total: number }
}

const day = (iso: string) => new Date(iso).toLocaleDateString()

export function ListingDetailScreen(props: {
  listingId: string
  session?: Session
  onBack: () => void
  onNeedLogin: () => void
}) {
  const { t, i18n } = useTranslation()
  const [listing, setListing] = useState<Listing | undefined>()
  const [errorKey, setErrorKey] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [purchased, setPurchased] = useState<Purchased | undefined>()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await api<{ listing: Listing }>(
        'GET',
        `/store/listings/${props.listingId}?locale=${i18n.language}`,
      )
      if (cancelled) return
      if (!result.ok || !result.data) {
        setErrorKey(result.errorKey ?? 'unknown')
        return
      }
      setListing(result.data.listing)
    })()
    return () => {
      cancelled = true
    }
    // 言語を変えたら読み直す。訳が入っていればそちらに変わる（受け入れ基準 I3）。
  }, [props.listingId, i18n.language])

  const buy = async () => {
    if (!props.session) {
      props.onNeedLogin()
      return
    }
    setBusy(true)
    setErrorKey(undefined)

    const result = await api<Purchased>('POST', '/store/purchases', {
      body: { listing_id: props.listingId },
      token: props.session.token,
    })
    setBusy(false)

    if (!result.ok || !result.data) {
      setErrorKey(result.errorKey ?? 'unknown')
      return
    }
    setPurchased(result.data)
  }

  if (purchased) {
    return (
      <div style={{ ...card, maxWidth: '520px' }}>
        <h1 style={{ fontSize: 'var(--text-h2)', marginTop: 0 }}>{t('purchase.doneTitle')}</h1>
        <p>
          {t('purchase.doneMessage', {
            title: purchased.title,
            seller: purchased.seller_name ?? '',
          })}
        </p>
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <div style={label}>{t('purchase.balanceAfter')}</div>
          <div className="numeric">
            {t('balance.total')}: {money(purchased.balance.total, t('money.unit'))}
            {purchased.balance.bonus > 0 && (
              <span style={hint}>
                {' '}
                （{t('balance.bonus')} {purchased.balance.bonus.toLocaleString()}）
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={props.onBack}
          style={{ ...primaryButton, marginTop: 'var(--sp-6)' }}
        >
          {t('purchase.keepShopping')}
        </button>
      </div>
    )
  }

  if (!listing) {
    return (
      <p style={hint}>{errorKey ? t(`errors.${errorKey}`) : t('market.loading')}</p>
    )
  }

  return (
    <div>
      <button type="button" onClick={props.onBack} style={{ ...quietButton, marginBottom: 'var(--sp-4)' }}>
        {t('common.back')}
      </button>

      <div
        style={{
          display: 'grid',
          // 幅が狭い画面では縦に積む。横スクロールを出さない（受け入れ基準 J3）。
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--sp-6)',
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
            borderRadius: 'var(--radius-md)',
          }}
        />

        <div>
          <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{listing.title}</h1>
          <div style={hint}>
            {t('market.seller')}: {listing.organization_name}
          </div>

          <div className="numeric" style={{ fontSize: 'var(--text-h2)', marginTop: 'var(--sp-4)' }}>
            {money(listing.price, t('money.unit'))}
          </div>
          <div className="numeric" style={hint}>
            {t('market.remaining')}: {listing.available_quantity}
          </div>

          {errorKey && <p style={errorText}>{t(`errors.${errorKey}`)}</p>}

          {listing.can_buy ? (
            <button
              type="button"
              onClick={buy}
              disabled={busy}
              style={{ ...primaryButton, marginTop: 'var(--sp-4)', width: '100%' }}
            >
              {t('market.buy')}
            </button>
          ) : (
            <div
              style={{
                marginTop: 'var(--sp-4)',
                padding: 'var(--sp-3)',
                textAlign: 'center',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              {t(`unavailable.${listing.unavailable_reason ?? 'sold_out'}`)}
            </div>
          )}

          {!props.session && <p style={hint}>{t('detail.loginToBuy')}</p>}
        </div>
      </div>

      <section style={{ ...card, marginTop: 'var(--sp-6)' }}>
        {/* 訳で読んでいることが分かるようにする。原文と違って見えても戸惑わない。 */}
        {listing.translated_from && (
          <p style={hint}>
            {t('translations.shownAs', {
              language:
                LOCALES.find((locale) => locale.code === listing.translated_from)?.label ??
                listing.translated_from,
            })}
          </p>
        )}
        <div style={label}>{t('detail.description')}</div>
        <p style={{ marginTop: 0 }}>{listing.description}</p>

        <div style={label}>{t('detail.targetCustomer')}</div>
        <p style={{ marginTop: 0 }}>{listing.target_customer}</p>

        <div style={label}>{t('detail.problemSolved')}</div>
        <p style={{ marginTop: 0 }}>{listing.problem_solved}</p>

        <div style={label}>{t('detail.salePeriod')}</div>
        <p className="numeric" style={{ marginTop: 0, marginBottom: 0 }}>
          {day(listing.sale_starts_at)} – {day(listing.sale_ends_at)}
        </p>
      </section>
    </div>
  )
}
