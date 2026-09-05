import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import { hint, money, quietButton } from '../ui'

/**
 * ランキング（要件25、受け入れ基準 G2）。
 *
 * **5つの指標で切り替えられる。** 売上だけで並べると勝者総取りのゲームになり、
 * 「売れる仕組みを作る」という授業の狙いから外れる。
 *
 * 出すのは**企業名だけ**。Market ID は出さない（要件38）。
 */

const METRICS = ['revenue', 'profit', 'profit_margin', 'customers', 'roas'] as const
type Metric = (typeof METRICS)[number]

interface Row {
  rank: number
  organization_name: string
  revenue: number
  profit: number
  profit_margin: number
  customers: number
  roas: number
}

export function RankingScreen() {
  const { t } = useTranslation()
  const [metric, setMetric] = useState<Metric>('revenue')
  const [rows, setRows] = useState<Row[] | undefined>()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await api<{ ranking: Row[] }>('GET', `/store/ranking?metric=${metric}`)
      if (!cancelled && response.ok && response.data) setRows(response.data.ranking)
    })()
    return () => {
      cancelled = true
    }
  }, [metric])

  /** 指標ごとに単位が違う。％や倍を MP と書くと読み違える。 */
  const valueOf = (row: Row) => {
    if (metric === 'profit_margin') return `${row.profit_margin}%`
    if (metric === 'customers') return String(row.customers)
    if (metric === 'roas') return String(row.roas)
    return money(row[metric], t('money.unit'))
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('ranking.title')}</h1>
      <p style={hint}>{t('ranking.subtitle')}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
        {METRICS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setMetric(name)}
            style={{
              ...quietButton,
              ...(metric === name
                ? {
                    background: 'var(--accent)',
                    color: 'var(--accent-text)',
                    borderColor: 'var(--accent)',
                  }
                : {}),
            }}
          >
            {t(`ranking.metric.${name}`)}
          </button>
        ))}
      </div>

      {rows?.length === 0 && <p>{t('ranking.empty')}</p>}

      {/* 表だけを横に流す。ページごと流すと幅375pxで崩れる（受け入れ基準 J3）。 */}
      <div className="table-scroll" style={{ marginTop: 'var(--sp-4)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {[t('ranking.rank'), t('ranking.company'), t(`ranking.metric.${metric}`)].map(
                (heading, index) => (
                  <th
                    key={heading}
                    style={{
                      padding: 'var(--sp-3)',
                      borderBottom: '1px solid var(--border)',
                      textAlign: index === 2 ? 'right' : 'left',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <tr key={`${row.rank}-${row.organization_name}`}>
                <td
                  className="numeric"
                  style={{ padding: 'var(--sp-3)', borderBottom: '1px solid var(--border)' }}
                >
                  {row.rank}
                </td>
                {/* 企業名だけ。Market ID は出さない（要件38）。 */}
                <td style={{ padding: 'var(--sp-3)', borderBottom: '1px solid var(--border)' }}>
                  {row.organization_name}
                </td>
                <td
                  className="numeric"
                  style={{
                    padding: 'var(--sp-3)',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {valueOf(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
