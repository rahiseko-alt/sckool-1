import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Session } from '../session'
import { card, hint, label, money, primaryButton } from '../ui'

/**
 * 経営ダッシュボード（要件16、受け入れ基準 G1）。
 *
 * **数字はサーバーが取引履歴から計算したものをそのまま出す。** 画面で計算し直すと、
 * 履歴と食い違ったときにどちらが正しいか分からなくなる。
 */

interface Dashboard {
  organization_name: string
  balance: { normal: number; bonus: number; total: number }
  stats: {
    revenue: number
    expenses: number
    profit: number
    profit_margin: number
    sales_count: number
    purchase_count: number
    ad_spend: number
  }
  product_sales: { listing_id: string; title: string | null; revenue: number }[]
  revenue_chart: { date: string; revenue: number }[]
}

export function DashboardScreen(props: { session?: Session; onNeedLogin: () => void }) {
  const { t } = useTranslation()
  const [data, setData] = useState<Dashboard | undefined>()

  useEffect(() => {
    if (!props.session) return
    let cancelled = false
    void (async () => {
      const response = await api<Dashboard>('GET', '/store/dashboard', {
        token: props.session!.token,
      })
      if (!cancelled && response.ok && response.data) setData(response.data)
    })()
    return () => {
      cancelled = true
    }
  }, [props.session])

  if (!props.session) {
    return (
      <div>
        <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('dashboard.title')}</h1>
        <p style={hint}>{t('dashboard.loginRequired')}</p>
        <button type="button" onClick={props.onNeedLogin} style={primaryButton}>
          {t('nav.login')}
        </button>
      </div>
    )
  }

  if (!data) return <p style={hint}>{t('market.loading')}</p>

  const unit = t('money.unit')
  const figures: { key: string; value: string }[] = [
    { key: 'dashboard.revenue', value: money(data.stats.revenue, unit) },
    { key: 'dashboard.expenses', value: money(data.stats.expenses, unit) },
    { key: 'dashboard.profit', value: money(data.stats.profit, unit) },
    { key: 'dashboard.profitMargin', value: `${data.stats.profit_margin}%` },
    { key: 'dashboard.salesCount', value: String(data.stats.sales_count) },
    { key: 'dashboard.purchaseCount', value: String(data.stats.purchase_count) },
    { key: 'dashboard.adSpend', value: money(data.stats.ad_spend, unit) },
  ]

  const highest = Math.max(1, ...data.revenue_chart.map((point) => point.revenue))

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('dashboard.title')}</h1>
      <p style={hint}>{t('dashboard.lead')}</p>

      <section style={{ ...card, marginTop: 'var(--sp-4)' }}>
        <div style={label}>{t('balance.title')}</div>
        <div className="numeric" style={{ fontSize: 'var(--text-display)' }}>
          {money(data.balance.total, unit)}
        </div>
        <div className="numeric" style={hint}>
          {t('balance.normal')} {data.balance.normal.toLocaleString()} ／ {t('balance.bonus')}{' '}
          {data.balance.bonus.toLocaleString()}
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 'var(--sp-3)',
          marginTop: 'var(--sp-4)',
        }}
      >
        {figures.map((figure) => (
          <div key={figure.key} style={card}>
            <div style={hint}>{t(figure.key)}</div>
            <div className="numeric" style={{ fontSize: 'var(--text-h2)' }}>
              {figure.value}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 'var(--text-h2)', marginTop: 'var(--sp-8)' }}>
        {t('dashboard.revenueChart')}
      </h2>
      {/*
        売れなかった日も0のまま並べる。詰めると右肩上がりに見えて読み違える。
        棒の高さだけの簡単な図にしてある。図の道具を足すと、教材めいた見た目に寄りやすい。
      */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '2px',
          height: '120px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {data.revenue_chart.map((point) => (
          <div
            key={point.date}
            title={`${point.date}: ${money(point.revenue, unit)}`}
            style={{
              flex: 1,
              height: `${Math.round((point.revenue / highest) * 100)}%`,
              minHeight: '1px',
              background: point.revenue > 0 ? 'var(--accent)' : 'var(--border)',
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
      </div>

      <h2 style={{ fontSize: 'var(--text-h2)', marginTop: 'var(--sp-8)' }}>
        {t('dashboard.productSales')}
      </h2>
      {data.product_sales.length === 0 && <p style={hint}>{t('dashboard.noSales')}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {data.product_sales.map((row) => (
          <li
            key={row.listing_id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 'var(--sp-4)',
              padding: 'var(--sp-3) 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span>{row.title}</span>
            <span className="numeric">{money(row.revenue, unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
