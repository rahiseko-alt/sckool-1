import { useEffect, useState } from 'react'

/**
 * 管理者が全企業を1画面で見る（要件26、受け入れ基準 H1）。
 *
 * 数字は `/admin/organizations` が返すものをそのまま出す。**画面では計算しない。**
 * 画面で計算し直すと、企業ダッシュボードと数え方がずれても誰も気づけない。
 *
 * この経路は Medusa の管理者認証を通らないと呼べないので、生徒のアカウントで
 * 開いても中身は出ない。
 *
 * 見た目は Mercur の管理画面のものに合わせる。`docs/design.md` の決まりは
 * **生徒に見せる画面**（要件39〜43）のためのもので、ここは対象外。
 * 色は増減の判別に使う2色だけを指定し、あとは管理画面の既定に任せる。
 */

declare const __BACKEND_URL__: string

/** 増えた・減ったを一目で分かるようにする。装飾ではなく読み違いを防ぐため。 */
const POSITIVE = '#15803d'
const NEGATIVE = '#b91c1c'

/** 並べ替えに使える列。API が受け付ける名前と同じにする。 */
const COLUMNS = [
  { key: 'organization_name', label: '企業名', numeric: false },
  { key: 'balance_total', label: '残高', numeric: true },
  { key: 'revenue', label: '売上', numeric: true },
  { key: 'expenses', label: '支出', numeric: true },
  { key: 'profit', label: '利益', numeric: true },
  { key: 'profit_margin', label: '利益率', numeric: true },
  { key: 'listing_count', label: '商品数', numeric: true },
  { key: 'ad_spend', label: '広告費', numeric: true },
] as const

type SortKey = (typeof COLUMNS)[number]['key']

interface Row {
  market_id: string
  organization_name: string
  balance_normal: number
  balance_bonus: number
  balance_total: number
  revenue: number
  expenses: number
  profit: number
  profit_margin: number
  listing_count: number
  ad_spend: number
}

interface Overview {
  sort: SortKey
  organizations: Row[]
  totals: {
    organizations: number
    balance_total: number
    revenue: number
    profit: number
    ad_spend: number
    listing_count: number
  }
  supply: { matches: boolean; unassigned: number }
}

const mp = (value: number) => `${value.toLocaleString('ja-JP')} MP`

const cell: React.CSSProperties = {
  padding: '12px',
  borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
  whiteSpace: 'nowrap',
}

const numericCell: React.CSSProperties = {
  ...cell,
  textAlign: 'right',
  // 桁を揃えないと、残高や売上が並んだときに読み違える。
  fontVariantNumeric: 'tabular-nums',
}

const OrganizationsPage = () => {
  const [sort, setSort] = useState<SortKey>('revenue')
  const [data, setData] = useState<Overview | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${__BACKEND_URL__}/admin/organizations?sort=${sort}`, {
          credentials: 'include',
        })
        if (cancelled) return
        if (!response.ok) {
          // 401 は「管理者として入っていない」。生徒のアカウントではここに来る。
          setError(
            response.status === 401
              ? '管理者としてログインしてください'
              : `読み込めません（${response.status}）`,
          )
          return
        }
        setError(undefined)
        setData((await response.json()) as Overview)
      } catch {
        if (!cancelled) setError('バックエンドにつながりません')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sort])

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <h1 style={{ fontSize: '24px', margin: 0 }}>企業一覧</h1>
      <p style={{ opacity: 0.7, marginTop: '8px' }}>
        参加している企業の残高・売上・利益・商品数・広告費。列の見出しを押すと並べ替わります。
      </p>

      {error && <p style={{ color: NEGATIVE }}>{error}</p>}

      {data && (
        <>
          <p style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
            {data.totals.organizations} 社／残高の合計 {mp(data.totals.balance_total)}／売上の合計{' '}
            {mp(data.totals.revenue)}
            {!data.supply.matches && (
              <span style={{ color: NEGATIVE }}> ※ MP の勘定が合っていません</span>
            )}
          </p>

          {/* 入りきらないときは表だけを横に流す。ページごと流すと幅の狭い画面で崩れる。 */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      onClick={() => setSort(column.key)}
                      style={{
                        ...cell,
                        textAlign: column.numeric ? 'right' : 'left',
                        cursor: 'pointer',
                        fontWeight: sort === column.key ? 600 : 400,
                        opacity: sort === column.key ? 1 : 0.7,
                      }}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th style={{ ...cell, textAlign: 'left', fontWeight: 400, opacity: 0.7 }}>
                    Market ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.organizations.map((row) => (
                  <tr key={row.market_id}>
                    <td style={cell}>{row.organization_name}</td>
                    <td style={numericCell}>
                      {mp(row.balance_total)}
                      {row.balance_bonus > 0 && (
                        <span style={{ opacity: 0.7 }}>
                          {' '}
                          （ボーナス {row.balance_bonus.toLocaleString('ja-JP')}）
                        </span>
                      )}
                    </td>
                    <td style={numericCell}>{mp(row.revenue)}</td>
                    <td style={numericCell}>{mp(row.expenses)}</td>
                    <td
                      style={{
                        ...numericCell,
                        ...(row.profit > 0 ? { color: POSITIVE } : {}),
                        ...(row.profit < 0 ? { color: NEGATIVE } : {}),
                      }}
                    >
                      {mp(row.profit)}
                    </td>
                    <td style={numericCell}>{row.profit_margin}%</td>
                    <td style={numericCell}>{row.listing_count}</td>
                    <td style={numericCell}>{mp(row.ad_spend)}</td>
                    {/* 生徒の画面には出さない。管理者はパスワードの初期化に使う（受け入れ基準 A5）。 */}
                    <td style={{ ...cell, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                      {row.market_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.organizations.length === 0 && <p style={{ opacity: 0.7 }}>まだ企業がありません。</p>}
        </>
      )}
    </div>
  )
}

/** 左のメニューに出す。 */
export const config = {
  label: '企業一覧',
}

export default OrganizationsPage
