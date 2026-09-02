import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import { card, hint, money } from '../ui'

/**
 * トップページの Featured 枠（要件12、受け入れ基準 F1）。
 *
 * **広告を出した企業の商品が、買う人の目に触れる場所。** ここが無いと、
 * MP を払って買った枠が誰にも見られず、「広告費を出したら売上がどう変わるか」
 * という授業の狙い（要件13）が成り立たない。
 *
 * **広告だと分かるようにする。** 印を付けずに混ぜると、生徒は
 * 「なぜこの商品が上に出るのか」を誤解したまま真似することになる。
 */

interface FeaturedListing {
  placement_id: string
  listing_id: string
  title: string
  price: number
  image_url: string
  organization_name: string | null
  can_buy: boolean
}

export function Featured(props: { onOpen: (listingId: string) => void }) {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<FeaturedListing[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // この呼び出しが表示回数として数えられる（サーバー側で記録する）。
      const response = await api<{ featured: FeaturedListing[] }>(
        'GET',
        `/store/ads?locale=${i18n.language}`,
      )
      if (!cancelled && response.ok && response.data) setItems(response.data.featured)
    })()
    return () => {
      cancelled = true
    }
  }, [i18n.language])

  // 出ている広告が無いときは、枠ごと出さない。空の見出しだけが残ると落ち着かない。
  if (items.length === 0) return null

  const open = (item: FeaturedListing) => {
    // 押されたことを記録してから開く。記録できなくても開く（数字より操作を優先する）。
    void api('POST', `/store/ads/${item.placement_id}/click`)
    props.onOpen(item.listing_id)
  }

  return (
    <section style={{ marginBottom: 'var(--sp-8)' }}>
      <h2 style={{ fontSize: 'var(--text-h2)', margin: 0 }}>{t('featured.title')}</h2>
      <p style={hint}>{t('featured.lead')}</p>

      <div
        style={{
          display: 'grid',
          // 幅が狭い画面では1列になる。横スクロールを出さない（受け入れ基準 J3）。
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 'var(--sp-4)',
        }}
      >
        {items.map((item) => (
          <article
            key={item.placement_id}
            style={{ ...card, padding: 0, overflow: 'hidden', borderColor: 'var(--border-strong)' }}
          >
            <div style={{ position: 'relative' }}>
              <img
                src={item.image_url}
                alt=""
                style={{
                  width: '100%',
                  aspectRatio: '4 / 3',
                  objectFit: 'cover',
                  background: 'var(--bg-subtle)',
                  display: 'block',
                }}
              />
              {/* 広告だと分かる印。付けないと、なぜ上に出るのかを誤解する。 */}
              <span
                style={{
                  position: 'absolute',
                  top: 'var(--sp-2)',
                  left: 'var(--sp-2)',
                  padding: '2px var(--sp-2)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--text)',
                  color: 'var(--bg)',
                  fontSize: 'var(--text-small)',
                }}
              >
                {t('featured.badge')}
              </span>
            </div>

            <div style={{ padding: 'var(--sp-3)' }}>
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={hint}>
                {t('market.seller')}: {item.organization_name}
              </div>
              <div className="numeric" style={{ marginTop: 'var(--sp-2)' }}>
                {money(item.price, t('money.unit'))}
              </div>

              <button
                type="button"
                onClick={() => open(item)}
                style={{
                  marginTop: 'var(--sp-3)',
                  width: '100%',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  font: 'inherit',
                  padding: 'var(--sp-2)',
                  cursor: 'pointer',
                }}
              >
                {t('market.detail')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
