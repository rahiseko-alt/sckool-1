import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageShell } from '../../components/page-shell'
import { adminI18n } from '../../i18n'

/**
 * 取引の偏りを見る画面（要件20〜22、受け入れ基準 H2・H3）。
 *
 * **「不正な企業の一覧」ではない。** 買い合いと、本当に良いと思って買うことは
 * データから区別できない。画面にもそう書いておく。書かないと、数字が高い企業を
 * そのまま「不正」と読んでしまう。
 *
 * その断り書きは6言語すべてに入れる（受け入れ基準 I1）。**ここだけ日本語のままだと、
 * 日本語を読めない先生には「不正の一覧」に見える。**
 */

declare const __BACKEND_URL__: string

/** 目立たせる色。しきい値を超えた組にだけ使う。 */
const ALERT = '#b91c1c'
const ALERT_BG = '#fef2f2'

interface Named {
  market_id: string
  organization_name: string | null
}

interface MutualPair {
  a: Named
  b: Named
  between: number
  total: number
  rate: number
  flagged: boolean
}

interface Concentration {
  organization: Named
  top_seller: Named
  top_amount: number
  total_amount: number
  rate: number
  seller_count: number
}

interface Analysis {
  threshold: number
  trade_count: number
  mutual_trade: MutualPair[]
  purchase_concentration: Concentration[]
}

const nameOf = (named: Named) => named.organization_name ?? named.market_id

const cell: React.CSSProperties = {
  padding: '12px',
  borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
  whiteSpace: 'nowrap',
}

const numericCell: React.CSSProperties = {
  ...cell,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}

const headCell: React.CSSProperties = { ...cell, textAlign: 'left', fontWeight: 400, opacity: 0.7 }

const TradeAnalysisPage = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<Analysis | undefined>()
  const [error, setError] = useState<string | undefined>()

  const mp = (value: number) => `${value.toLocaleString()} ${t('money.unit')}`

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${__BACKEND_URL__}/admin/trade-analysis`, {
          credentials: 'include',
        })
        if (cancelled) return
        if (!response.ok) {
          setError(
            response.status === 401
              ? t('error.unauthorized')
              : t('error.load', { status: response.status }),
          )
          return
        }
        setError(undefined)
        setData((await response.json()) as Analysis)
      } catch {
        if (!cancelled) setError(t('error.offline'))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [t])

  return (
    <>
      {/* 間の空白を JSX 側で入れる。日本語以外は語の間に空白が要るので、
          辞書の文字列の端に空白を持たせると（見えないので）消える。 */}
      <p style={{ opacity: 0.7, marginTop: '8px' }}>
        {t('tradeAnalysis.lead')} <strong>{t('tradeAnalysis.notice')}</strong>{' '}
        {t('tradeAnalysis.detail')}
      </p>

      {error && <p style={{ color: ALERT }}>{error}</p>}

      {data && (
        <>
          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>{t('tradeAnalysis.mutual.title')}</h2>
          <p style={{ opacity: 0.7 }}>
            {t('tradeAnalysis.mutual.description', { threshold: data.threshold })}
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>{t('tradeAnalysis.mutual.columns.company')}</th>
                  <th style={headCell}>{t('tradeAnalysis.mutual.columns.partner')}</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('tradeAnalysis.mutual.columns.between')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('tradeAnalysis.mutual.columns.total')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('tradeAnalysis.mutual.columns.rate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.mutual_trade.map((pair) => (
                  <tr
                    key={`${pair.a.market_id}-${pair.b.market_id}`}
                    style={pair.flagged ? { background: ALERT_BG } : {}}
                  >
                    <td style={cell}>{nameOf(pair.a)}</td>
                    <td style={cell}>{nameOf(pair.b)}</td>
                    <td style={numericCell}>{mp(pair.between)}</td>
                    <td style={numericCell}>{mp(pair.total)}</td>
                    <td
                      style={{
                        ...numericCell,
                        ...(pair.flagged ? { color: ALERT, fontWeight: 600 } : {}),
                      }}
                    >
                      {pair.rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>
            {t('tradeAnalysis.concentration.title')}
          </h2>
          <p style={{ opacity: 0.7 }}>
            {t('tradeAnalysis.concentration.lead')}{' '}
            <strong>{t('tradeAnalysis.concentration.notice')}</strong>{' '}
            {t('tradeAnalysis.concentration.detail')}
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>{t('tradeAnalysis.concentration.columns.company')}</th>
                  <th style={headCell}>{t('tradeAnalysis.concentration.columns.topSeller')}</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('tradeAnalysis.concentration.columns.topAmount')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('tradeAnalysis.concentration.columns.totalAmount')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('tradeAnalysis.concentration.columns.sellerCount')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('tradeAnalysis.concentration.columns.rate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.purchase_concentration.map((row) => (
                  <tr key={row.organization.market_id}>
                    <td style={cell}>{nameOf(row.organization)}</td>
                    <td style={cell}>{nameOf(row.top_seller)}</td>
                    <td style={numericCell}>{mp(row.top_amount)}</td>
                    <td style={numericCell}>{mp(row.total_amount)}</td>
                    <td style={numericCell}>{row.seller_count}</td>
                    <td style={numericCell}>{row.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.trade_count === 0 && <p style={{ opacity: 0.7 }}>{t('tradeAnalysis.empty')}</p>}
        </>
      )}
    </>
  )
}

const TradeAnalysisRoute = () => (
  <PageShell titleKey="tradeAnalysis.title">
    <TradeAnalysisPage />
  </PageShell>
)

/** 左のメニューに出す。文言は起動時の言語で固定される（企業一覧のページと同じ）。 */
export const config = {
  label: adminI18n.t('tradeAnalysis.title'),
}

export default TradeAnalysisRoute
