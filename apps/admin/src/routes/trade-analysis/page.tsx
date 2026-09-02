import { useEffect, useState } from 'react'

/**
 * 取引の偏りを見る画面（要件20〜22、受け入れ基準 H2・H3）。
 *
 * **「不正な企業の一覧」ではない。** 買い合いと、本当に良いと思って買うことは
 * データから区別できない。画面にもそう書いておく。書かないと、数字が高い企業を
 * そのまま「不正」と読んでしまう。
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

const mp = (value: number) => `${value.toLocaleString('ja-JP')} MP`
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
  const [data, setData] = useState<Analysis | undefined>()
  const [error, setError] = useState<string | undefined>()

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
              ? '管理者としてログインしてください'
              : `読み込めません（${response.status}）`,
          )
          return
        }
        setError(undefined)
        setData((await response.json()) as Analysis)
      } catch {
        if (!cancelled) setError('バックエンドにつながりません')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <h1 style={{ fontSize: '24px', margin: 0 }}>取引の偏り</h1>
      <p style={{ opacity: 0.7, marginTop: '8px' }}>
        買い合いや1社への偏りを数字で出します。<strong>不正の判定ではありません。</strong>
        仲の良い相手の商品を本当に良いと思って買うことと、点数のために買い合うことは、
        データからは区別できません。気になった組は本人に聞いてください。
      </p>

      {error && <p style={{ color: ALERT }}>{error}</p>}

      {data && (
        <>
          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>相互取引率</h2>
          <p style={{ opacity: 0.7 }}>
            2社の間の取引額 ÷ その2社の総取引額。{data.threshold}% を超えた組を色で示します。
            互いとしか取引していない2社は 50% になります（総取引額に同じ額が2回入るため）。
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>企業</th>
                  <th style={headCell}>相手</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>2社の間</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>2社の総取引</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>相互取引率</th>
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

          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>購入集中率</h2>
          <p style={{ opacity: 0.7 }}>
            買った額のうち、一番多く買っている相手が占める割合。
            <strong>1社からしか買っていなければ必ず 100% です。</strong>
            買った回数が少ないだけの企業も上位に来るので、相手の数と金額を見てください。
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>企業</th>
                  <th style={headCell}>一番多い購入先</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>その相手へ</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>買った額</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>相手の数</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>購入集中率</th>
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

          {data.trade_count === 0 && <p style={{ opacity: 0.7 }}>まだ取引がありません。</p>}
        </>
      )}
    </div>
  )
}

/** 左のメニューに出す。 */
export const config = {
  label: '取引の偏り',
}

export default TradeAnalysisPage
