import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Session } from '../session'
import { card, errorText, hint, input, label, money, primaryButton } from '../ui'
import type { Listing } from './listing-detail'

/**
 * 商品を出す（受け入れ基準 C1・C3）。
 *
 * **項目名も、項目ごとのエラーも辞書から引く。** サーバーは「どの項目が
 * どういう問題か」（`field` と `problem`）だけを返し、文言は画面が作る。
 * サーバーが日本語の文言を作ると、ほかの言語を選んでいる生徒の画面に
 * その行だけ日本語が出る（受け入れ基準 I2）。
 */

interface FieldProblem {
  field: string
  problem: string
}

/** 入力欄の並び。要件6の必須項目をすべて出す。 */
const FIELDS = [
  { name: 'title', labelKey: 'listingForm.productTitle', type: 'text' },
  { name: 'description', labelKey: 'listingForm.description', type: 'textarea' },
  { name: 'target_customer', labelKey: 'listingForm.targetCustomer', type: 'text' },
  { name: 'problem_solved', labelKey: 'listingForm.problemSolved', type: 'text' },
  { name: 'price', labelKey: 'listingForm.price', type: 'number' },
  { name: 'available_quantity', labelKey: 'listingForm.quantity', type: 'number' },
  { name: 'image_url', labelKey: 'listingForm.imageUrl', type: 'text' },
  { name: 'sale_starts_at', labelKey: 'listingForm.saleStartsAt', type: 'date' },
  { name: 'sale_ends_at', labelKey: 'listingForm.saleEndsAt', type: 'date' },
] as const

export function ListingFormScreen(props: { session?: Session; onNeedLogin: () => void }) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>({})
  const [problems, setProblems] = useState<FieldProblem[]>([])
  const [errorKey, setErrorKey] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Listing | undefined>()
  const [mine, setMine] = useState<Listing[]>([])

  useEffect(() => {
    if (!props.session) return
    let cancelled = false
    void (async () => {
      // 自社の商品は市場一覧から絞り込む。専用の経路はまだ無い。
      const response = await api<{ listings: Listing[] }>('GET', '/store/listings')
      if (cancelled || !response.ok || !response.data) return
      setMine(
        response.data.listings.filter(
          (listing) => listing.organization_name === props.session?.organizationName,
        ),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [props.session, created])

  if (!props.session) {
    return (
      <div>
        <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('listingForm.title')}</h1>
        <p style={hint}>{t('detail.loginToBuy')}</p>
        <button type="button" onClick={props.onNeedLogin} style={primaryButton}>
          {t('nav.login')}
        </button>
      </div>
    )
  }

  const problemOf = (field: string) => problems.find((problem) => problem.field === field)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setProblems([])
    setErrorKey(undefined)

    const response = await api<{ listing: Listing }>('POST', '/store/listings', {
      body: {
        ...values,
        // 数字は数として送る。文字のままだと「1以上の整数」の判定に引っかかる。
        price: Number(values.price),
        available_quantity: Number(values.available_quantity),
      },
      token: props.session!.token,
    })
    setBusy(false)

    if (!response.ok || !response.data) {
      // 項目ごとの問題は、その項目の下に出す。まとめて上に出すと、
      // どれを直せばよいのか分からない。
      if (response.problems) setProblems(response.problems)
      setErrorKey(response.errorKey ?? 'unknown')
      return
    }

    setValues({})
    setCreated(response.data.listing)
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('listingForm.title')}</h1>
      <p style={hint}>{t('listingForm.lead')}</p>

      {created && (
        <div style={{ ...card, borderColor: 'var(--accent)' }}>
          <div style={{ fontWeight: 600 }}>{t('listingForm.done')}</div>
          <div>{created.title}</div>
          <button
            type="button"
            onClick={() => setCreated(undefined)}
            style={{ ...primaryButton, marginTop: 'var(--sp-3)' }}
          >
            {t('listingForm.another')}
          </button>
        </div>
      )}

      {!created && (
        <form onSubmit={submit} style={{ ...card, maxWidth: '560px' }}>
          {FIELDS.map((field) => {
            const problem = problemOf(field.name)
            return (
              <div key={field.name} style={{ marginBottom: 'var(--sp-4)' }}>
                <label style={label} htmlFor={field.name}>
                  {t(field.labelKey)}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={field.name}
                    value={values[field.name] ?? ''}
                    onChange={(event) =>
                      setValues({ ...values, [field.name]: event.target.value })
                    }
                    rows={4}
                    style={{ ...input, resize: 'vertical' }}
                  />
                ) : (
                  <input
                    id={field.name}
                    type={field.type}
                    value={values[field.name] ?? ''}
                    onChange={(event) =>
                      setValues({ ...values, [field.name]: event.target.value })
                    }
                    style={{
                      ...input,
                      ...(problem ? { borderColor: 'var(--negative)' } : {}),
                    }}
                  />
                )}
                {/* エラーはその項目の下に出す。上にまとめるとどれのことか分からない。 */}
                {problem && <div style={errorText}>{t(`field.${problem.problem}`)}</div>}
              </div>
            )
          })}

          {errorKey && problems.length === 0 && <p style={errorText}>{t(`errors.${errorKey}`)}</p>}

          <button type="submit" disabled={busy} style={{ ...primaryButton, width: '100%' }}>
            {busy ? t('listingForm.submitting') : t('listingForm.submit')}
          </button>
        </form>
      )}

      <h2 style={{ fontSize: 'var(--text-h2)', marginTop: 'var(--sp-8)' }}>
        {t('listingForm.myListings')}
      </h2>
      {mine.length === 0 && <p style={hint}>{t('listingForm.empty')}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {mine.map((listing) => (
          <li
            key={listing.id}
            style={{
              padding: 'var(--sp-3) 0',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 'var(--sp-4)',
            }}
          >
            <span>{listing.title}</span>
            <span className="numeric" style={{ whiteSpace: 'nowrap' }}>
              {money(listing.price, t('money.unit'))}／{t('market.remaining')}{' '}
              {listing.available_quantity}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
