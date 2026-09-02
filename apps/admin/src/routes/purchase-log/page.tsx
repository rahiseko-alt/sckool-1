import { useEffect, useState } from 'react'

/**
 * 先生の購入ログ（要件10・22、受け入れ基準 H4）。
 *
 * **先生どうしが互いの購入を見る**ための画面。見られていると分かっていれば、
 * 特定の生徒に肩入れしにくくなる。仕組みが止めるのではなく、見えるようにして防ぐ。
 */

declare const __BACKEND_URL__: string

const ALERT = '#b91c1c'

interface SellerRow {
  market_id: string
  organization_name: string | null
  amount: number
  count: number
}

interface AdminRow {
  admin_id: string
  admin_identifier: string | null
  purchase_count: number
  total_amount: number
  concentration_rate: number
  sellers: SellerRow[]
}

interface Log {
  administrators: AdminRow[]
  sellers: (SellerRow & { admin_count: number })[]
  totals: { administrators: number; purchase_count: number; total_amount: number }
  recent: {
    admin_identifier: string | null
    market_id: string
    organization_name: string | null
    amount: number
    at: string
  }[]
}

const mp = (value: number) => `${value.toLocaleString('ja-JP')} MP`
const when = (iso: string) => new Date(iso).toLocaleString('ja-JP')

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

const PurchaseLogPage = () => {
  const [data, setData] = useState<Log | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${__BACKEND_URL__}/admin/purchase-log`, {
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
        setData((await response.json()) as Log)
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
      <h1 style={{ fontSize: '24px', margin: 0 }}>先生の購入ログ</h1>
      <p style={{ opacity: 0.7, marginTop: '8px' }}>
        先生が誰からいくら買ったかを、<strong>先生どうしで見られるようにしています。</strong>
        意図しない偏りに自分で気づけるようにするための画面です。生徒には見えません。
      </p>

      {error && <p style={{ color: ALERT }}>{error}</p>}

      {data && (
        <>
          <p style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
            先生 {data.totals.administrators} 人／購入 {data.totals.purchase_count} 件／合計{' '}
            {mp(data.totals.total_amount)}
          </p>

          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>先生ごと</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>先生</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>購入回数</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>買った額</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>集中率</th>
                  <th style={headCell}>買った先</th>
                </tr>
              </thead>
              <tbody>
                {data.administrators.map((admin) => (
                  <tr key={admin.admin_id}>
                    <td style={cell}>{admin.admin_identifier ?? admin.admin_id}</td>
                    <td style={numericCell}>{admin.purchase_count}</td>
                    <td style={numericCell}>{mp(admin.total_amount)}</td>
                    <td style={numericCell}>{admin.concentration_rate}%</td>
                    <td style={{ ...cell, whiteSpace: 'normal' }}>
                      {admin.sellers.length === 0
                        ? 'まだ買っていません'
                        : admin.sellers
                            .map(
                              (seller) =>
                                `${seller.organization_name ?? seller.market_id}（${mp(seller.amount)} / ${seller.count}回）`,
                            )
                            .join('、')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>企業ごと（先生から買われた額）</h2>
          <p style={{ opacity: 0.7 }}>
            買った先生の人数も出しています。1人の先生がたくさん買ったのか、
            みんなが少しずつ買ったのかを見分けるためです。
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>企業</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>買われた額</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>回数</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>先生の人数</th>
                </tr>
              </thead>
              <tbody>
                {data.sellers.map((seller) => (
                  <tr key={seller.market_id}>
                    <td style={cell}>{seller.organization_name ?? seller.market_id}</td>
                    <td style={numericCell}>{mp(seller.amount)}</td>
                    <td style={numericCell}>{seller.count}</td>
                    <td style={numericCell}>{seller.admin_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>新しい順</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>いつ</th>
                  <th style={headCell}>先生</th>
                  <th style={headCell}>買った先</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((row, index) => (
                  <tr key={`${row.at}-${index}`}>
                    <td style={cell}>{when(row.at)}</td>
                    <td style={cell}>{row.admin_identifier}</td>
                    <td style={cell}>{row.organization_name ?? row.market_id}</td>
                    <td style={numericCell}>{mp(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.recent.length === 0 && (
            <p style={{ opacity: 0.7 }}>まだ先生の購入がありません。</p>
          )}
        </>
      )}
    </div>
  )
}

/** 左のメニューに出す。 */
export const config = {
  label: '先生の購入ログ',
}

export default PurchaseLogPage
