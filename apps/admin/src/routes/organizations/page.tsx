import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageShell } from '../../components/page-shell'
import { adminI18n } from '../../i18n'

/**
 * 管理者が全企業を1画面で見る（要件26、受け入れ基準 H1）。
 *
 * 数字は `/admin/organizations` が返すものをそのまま出す。**画面では計算しない。**
 * 画面で計算し直すと、企業ダッシュボードと数え方がずれても誰も気づけない。
 *
 * この経路は Medusa の管理者認証を通らないと呼べないので、生徒のアカウントで
 * 開いても中身は出ない。
 *
 * 文字列は辞書から引く（要件34、受け入れ基準 I1）。**画面に日本語を直接書かない。**
 *
 * 見た目は Mercur の管理画面のものに合わせる。`docs/design.md` の決まりは
 * **生徒に見せる画面**（要件39〜43）のためのもので、ここは対象外。
 * 色は増減の判別に使う2色だけを指定し、あとは管理画面の既定に任せる。
 */

declare const __BACKEND_URL__: string

/** 増えた・減ったを一目で分かるようにする。装飾ではなく読み違いを防ぐため。 */
const POSITIVE = '#15803d'
const NEGATIVE = '#b91c1c'

/** 並べ替えに使える列。`key` は API が受け付ける名前、`labelKey` は辞書のキー。 */
const COLUMNS = [
  { key: 'organization_name', labelKey: 'organizations.columns.organizationName', numeric: false },
  { key: 'balance_total', labelKey: 'organizations.columns.balanceTotal', numeric: true },
  { key: 'revenue', labelKey: 'organizations.columns.revenue', numeric: true },
  { key: 'expenses', labelKey: 'organizations.columns.expenses', numeric: true },
  { key: 'profit', labelKey: 'organizations.columns.profit', numeric: true },
  { key: 'profit_margin', labelKey: 'organizations.columns.profitMargin', numeric: true },
  { key: 'listing_count', labelKey: 'organizations.columns.listingCount', numeric: true },
  { key: 'ad_spend', labelKey: 'organizations.columns.adSpend', numeric: true },
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
  const { t } = useTranslation()
  const [sort, setSort] = useState<SortKey>('revenue')
  const [data, setData] = useState<Overview | undefined>()
  const [error, setError] = useState<string | undefined>()

  // 単位（MP）だけは辞書から引く。数字の区切りは見る人のブラウザに任せる。
  const mp = (value: number) => `${value.toLocaleString()} ${t('money.unit')}`

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
              ? t('error.unauthorized')
              : t('error.load', { status: response.status }),
          )
          return
        }
        setError(undefined)
        setData((await response.json()) as Overview)
      } catch {
        if (!cancelled) setError(t('error.offline'))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // 言語を変えたら、出しているエラーの文言も変える。
  }, [sort, t])

  return (
    <>
      <p style={{ opacity: 0.7, marginTop: '8px' }}>{t('organizations.description')}</p>

      {error && <p style={{ color: NEGATIVE }}>{error}</p>}

      {data && (
        <>
          <p style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
            {t('organizations.summary', {
              organizations: data.totals.organizations.toLocaleString(),
              balance: mp(data.totals.balance_total),
              revenue: mp(data.totals.revenue),
            })}
            {!data.supply.matches && (
              <span style={{ color: NEGATIVE }}> {t('organizations.supplyMismatch')}</span>
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
                      {t(column.labelKey)}
                    </th>
                  ))}
                  <th style={{ ...cell, textAlign: 'left', fontWeight: 400, opacity: 0.7 }}>
                    {t('organizations.columns.marketId')}
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
                          {t('organizations.bonus', {
                            amount: row.balance_bonus.toLocaleString(),
                          })}
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

          {data.organizations.length === 0 && (
            <p style={{ opacity: 0.7 }}>{t('organizations.empty')}</p>
          )}
        </>
      )}
    </>
  )
}

const OrganizationsRoute = () => (
  <PageShell titleKey="organizations.title">
    <OrganizationsPage />
  </PageShell>
)

/**
 * 左のメニューに出す。
 *
 * **一覧は管理画面の起動時に1回だけ作られる**ので、ここは選んである言語で固定になる。
 * 言語を変えたあとメニューの文字も変えるには、画面を開き直す必要がある。
 */
export const config = {
  label: adminI18n.t('organizations.title'),
}

export default OrganizationsRoute
