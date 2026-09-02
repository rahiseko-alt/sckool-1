import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageShell } from '../../components/page-shell'
import { adminI18n } from '../../i18n'

/**
 * 先生の購入ログ（要件10・22、受け入れ基準 H4）。
 *
 * **先生どうしが互いの購入を見る**ための画面。見られていると分かっていれば、
 * 特定の生徒に肩入れしにくくなる。仕組みが止めるのではなく、見えるようにして防ぐ。
 *
 * 文字列は辞書から引く（要件34、受け入れ基準 I1）。
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

const when = (iso: string) => new Date(iso).toLocaleString()

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
  const { t } = useTranslation()
  const [data, setData] = useState<Log | undefined>()
  const [error, setError] = useState<string | undefined>()

  const mp = (value: number) => `${value.toLocaleString()} ${t('money.unit')}`

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
              ? t('error.unauthorized')
              : t('error.load', { status: response.status }),
          )
          return
        }
        setError(undefined)
        setData((await response.json()) as Log)
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
      {/* 間の空白は JSX 側で入れる（辞書の端に空白を置くと消える）。 */}
      <p style={{ opacity: 0.7, marginTop: '8px' }}>
        {t('purchaseLog.lead')} <strong>{t('purchaseLog.notice')}</strong>{' '}
        {t('purchaseLog.detail')}
      </p>

      {error && <p style={{ color: ALERT }}>{error}</p>}

      {data && (
        <>
          <p style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
            {t('purchaseLog.summary', {
              admins: data.totals.administrators.toLocaleString(),
              purchases: data.totals.purchase_count.toLocaleString(),
              amount: mp(data.totals.total_amount),
            })}
          </p>

          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>{t('purchaseLog.byAdmin.title')}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>{t('purchaseLog.byAdmin.columns.admin')}</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('purchaseLog.byAdmin.columns.purchaseCount')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('purchaseLog.byAdmin.columns.totalAmount')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('purchaseLog.byAdmin.columns.concentration')}
                  </th>
                  <th style={headCell}>{t('purchaseLog.byAdmin.columns.sellers')}</th>
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
                        ? t('purchaseLog.byAdmin.noPurchase')
                        : admin.sellers
                            .map((seller) =>
                              t('purchaseLog.byAdmin.seller', {
                                name: seller.organization_name ?? seller.market_id,
                                amount: mp(seller.amount),
                                times: seller.count,
                              }),
                            )
                            // 区切りの記号も言語で違う（日本語と中国語は読点、ほかは
                            // コンマと空白）。ここを固定にすると英語やタイ語で読めなくなる。
                            .join(t('purchaseLog.byAdmin.separator'))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>{t('purchaseLog.bySeller.title')}</h2>
          <p style={{ opacity: 0.7 }}>{t('purchaseLog.bySeller.description')}</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>{t('purchaseLog.bySeller.columns.company')}</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('purchaseLog.bySeller.columns.amount')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('purchaseLog.bySeller.columns.count')}
                  </th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('purchaseLog.bySeller.columns.adminCount')}
                  </th>
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

          <h2 style={{ fontSize: '18px', marginTop: '32px' }}>{t('purchaseLog.recent.title')}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>{t('purchaseLog.recent.columns.when')}</th>
                  <th style={headCell}>{t('purchaseLog.recent.columns.admin')}</th>
                  <th style={headCell}>{t('purchaseLog.recent.columns.seller')}</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>
                    {t('purchaseLog.recent.columns.amount')}
                  </th>
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

          {data.recent.length === 0 && <p style={{ opacity: 0.7 }}>{t('purchaseLog.empty')}</p>}
        </>
      )}
    </>
  )
}

const PurchaseLogRoute = () => (
  <PageShell titleKey="purchaseLog.title">
    <PurchaseLogPage />
  </PageShell>
)

/** 左のメニューに出す。文言は起動時の言語で固定される（企業一覧のページと同じ）。 */
export const config = {
  label: adminI18n.t('purchaseLog.title'),
}

export default PurchaseLogRoute
