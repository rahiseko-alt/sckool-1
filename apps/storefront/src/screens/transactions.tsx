import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Session } from '../session'
import { hint, money, primaryButton } from '../ui'

/**
 * 自社の取引履歴（受け入れ基準 D5）。
 *
 * 相手は**企業名だけ**。Market ID は出さない（要件38）。
 * 取引の種類は `kind` として受け取り、**文言は辞書から引く**。
 * サーバーが日本語の文言を作ると、その行だけ日本語のまま残る。
 */

interface Row {
  id: string
  occurred_at: string
  kind: string
  pocket: string
  amount: number
  listing_title?: string
  counterpart_name: string | null
}

export function TransactionsScreen(props: { session?: Session; onNeedLogin: () => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Row[] | undefined>()

  useEffect(() => {
    if (!props.session) return
    let cancelled = false
    void (async () => {
      const response = await api<{ transactions: Row[] }>('GET', '/store/transactions', {
        token: props.session!.token,
      })
      if (!cancelled && response.ok && response.data) setRows(response.data.transactions)
    })()
    return () => {
      cancelled = true
    }
  }, [props.session])

  if (!props.session) {
    return (
      <div>
        <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('transaction.title')}</h1>
        <p style={hint}>{t('dashboard.loginRequired')}</p>
        <button type="button" onClick={props.onNeedLogin} style={primaryButton}>
          {t('nav.login')}
        </button>
      </div>
    )
  }

  const cell = {
    padding: 'var(--sp-3)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap' as const,
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('transaction.title')}</h1>

      {rows?.length === 0 && <p style={hint}>{t('transaction.empty')}</p>}

      {/* 表だけを横に流す。ページごと流すと幅375pxで崩れる（受け入れ基準 J3）。 */}
      <div className="table-scroll">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['transaction.when', 'transaction.what', 'transaction.counterpart'].map((key) => (
                <th
                  key={key}
                  style={{ ...cell, textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}
                >
                  {t(key)}
                </th>
              ))}
              <th
                style={{ ...cell, textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}
              >
                {t('transaction.amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <tr key={row.id}>
                <td className="numeric" style={cell}>
                  {new Date(row.occurred_at).toLocaleString()}
                </td>
                <td style={{ ...cell, whiteSpace: 'normal' }}>
                  {t(`transaction.kind.${row.kind}`)}
                  {row.listing_title && <span style={hint}> — {row.listing_title}</span>}
                </td>
                {/* 相手は企業名だけ（要件38）。 */}
                <td style={cell}>{row.counterpart_name ?? '—'}</td>
                <td
                  className="numeric"
                  style={{
                    ...cell,
                    textAlign: 'right',
                    color: row.amount >= 0 ? 'var(--positive)' : 'var(--negative)',
                  }}
                >
                  {row.amount > 0 ? '+' : ''}
                  {money(row.amount, t('money.unit'))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
