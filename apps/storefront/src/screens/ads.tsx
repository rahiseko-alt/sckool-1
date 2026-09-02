import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Session } from '../session'
import { card, errorText, hint, input, label, money, primaryButton } from '../ui'
import type { Listing } from './listing-detail'

/**
 * 広告を出して効果を見る（要件12・13、受け入れ基準 F1・F2）。
 *
 * 広告は「お金を使わない企業は成長できない」という構造の柱。払った MP は
 * 市場から出ていくので、持っているだけでは有利にならない。
 */

interface Placement {
  id: string
  listing_id: string
  listing_title: string | null
  spend: number
  starts_at: string
  ends_at: string
  is_active: boolean
  metrics: {
    impressions: number
    clicks: number
    ctr: number
    conversions: number
    revenue: number
    spend: number
    roas: number
  }
}

/** 選べる日数。1日あたりの単価はサーバーが決める。 */
const DAY_CHOICES = [1, 3, 7, 14]

export function AdsScreen(props: { session?: Session; onNeedLogin: () => void }) {
  const { t } = useTranslation()
  const [placements, setPlacements] = useState<Placement[]>([])
  const [mine, setMine] = useState<Listing[]>([])
  const [listingId, setListingId] = useState('')
  const [days, setDays] = useState(7)
  const [errorKey, setErrorKey] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!props.session) return
    let cancelled = false
    void (async () => {
      const [ads, listings] = await Promise.all([
        api<{ placements: Placement[] }>('GET', '/store/ads/mine', {
          token: props.session!.token,
        }),
        api<{ listings: Listing[] }>('GET', '/store/listings'),
      ])
      if (cancelled) return
      if (ads.ok && ads.data) setPlacements(ads.data.placements)
      if (listings.ok && listings.data) {
        setMine(
          listings.data.listings.filter(
            (listing) => listing.organization_name === props.session?.organizationName,
          ),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.session, reload])

  if (!props.session) {
    return (
      <div>
        <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('ads.title')}</h1>
        <p style={hint}>{t('dashboard.loginRequired')}</p>
        <button type="button" onClick={props.onNeedLogin} style={primaryButton}>
          {t('nav.login')}
        </button>
      </div>
    )
  }

  const buy = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrorKey(undefined)
    const response = await api('POST', '/store/ads', {
      body: { listing_id: listingId, days },
      token: props.session!.token,
    })
    setBusy(false)
    if (!response.ok) {
      setErrorKey(response.errorKey ?? 'unknown')
      return
    }
    setReload((value) => value + 1)
  }

  const unit = t('money.unit')

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('ads.title')}</h1>
      <p style={hint}>{t('ads.lead')}</p>

      {mine.length === 0 ? (
        <p style={hint}>{t('ads.needListing')}</p>
      ) : (
        <form onSubmit={buy} style={{ ...card, maxWidth: '480px' }}>
          <label style={label} htmlFor="ad-listing">
            {t('ads.chooseListing')}
          </label>
          <select
            id="ad-listing"
            value={listingId}
            onChange={(event) => setListingId(event.target.value)}
            required
            style={input}
          >
            <option value="">—</option>
            {mine.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.title}
              </option>
            ))}
          </select>

          <label style={{ ...label, marginTop: 'var(--sp-4)' }} htmlFor="ad-days">
            {t('ads.days')}
          </label>
          <select
            id="ad-days"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            style={input}
          >
            {DAY_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>

          {errorKey && <p style={errorText}>{t(`errors.${errorKey}`)}</p>}

          <button
            type="submit"
            disabled={busy}
            style={{ ...primaryButton, marginTop: 'var(--sp-4)', width: '100%' }}
          >
            {t('ads.buy')}
          </button>
        </form>
      )}

      {placements.length === 0 && <p style={hint}>{t('ads.empty')}</p>}

      {placements.map((placement) => (
        <section key={placement.id} style={{ ...card, marginTop: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
            <div style={{ fontWeight: 600 }}>{placement.listing_title}</div>
            <div style={hint}>{placement.is_active ? t('ads.active') : t('ads.ended')}</div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 'var(--sp-3)',
              marginTop: 'var(--sp-3)',
            }}
          >
            {[
              { key: 'ads.impressions', value: String(placement.metrics.impressions) },
              { key: 'ads.clicks', value: String(placement.metrics.clicks) },
              { key: 'ads.ctr', value: `${placement.metrics.ctr}%` },
              { key: 'ads.conversions', value: String(placement.metrics.conversions) },
              { key: 'ads.adRevenue', value: money(placement.metrics.revenue, unit) },
              { key: 'ads.price', value: money(placement.spend, unit) },
              // 1を割ると「払ったぶん戻っていない」。数字だけを出し、判断は生徒がする。
              { key: 'ads.roas', value: String(placement.metrics.roas) },
            ].map((figure) => (
              <div key={figure.key}>
                <div style={hint}>{t(figure.key)}</div>
                <div className="numeric">{figure.value}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
