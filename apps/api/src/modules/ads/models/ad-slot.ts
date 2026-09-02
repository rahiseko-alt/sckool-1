import { model } from '@medusajs/framework/utils'

/**
 * トップページの「Featured」枠に出す広告（要件12、受け入れ基準 F1）。
 *
 * 企業が MP を払って期間を買う。払った分だけ市場から MP が出ていくので、
 * 「お金を使わない企業は成長できない」という構造（要件4）の柱になる。
 *
 * **この表に個人情報の列を足してはいけない**（受け入れ基準 A3）。
 */
export const AdPlacement = model
  .define('ad_placement', {
    id: model.id({ prefix: 'ad' }).primaryKey(),

    /** 広告を出している企業。 */
    organization_id: model.text().searchable(),

    /** どの商品の広告か。押されたらこの商品へ飛ぶ。 */
    listing_id: model.text(),

    /** 払った額。企業ダッシュボードの広告費と ROAS の計算に使う。 */
    spend: model.bigNumber(),

    starts_at: model.dateTime(),
    ends_at: model.dateTime(),
  })
  .indexes([{ on: ['starts_at', 'ends_at'] }, { on: ['organization_id'] }])

/**
 * 広告の効果（要件13、受け入れ基準 F2）。
 *
 * 表示・クリック・購入を**1行1件**で記録する。合計だけを持つと、
 * あとから「いつ効いたか」を見られず、改善の手がかりが消える。
 */
export const AdEvent = model
  .define('ad_event', {
    id: model.id({ prefix: 'adev' }).primaryKey(),
    placement_id: model.text().searchable(),
    /** 表示された・押された・押した人が買った。 */
    kind: model.enum(['impression', 'click', 'conversion']),
    /** 買われたときの金額。表示と押下では0。ROAS の計算に使う。 */
    revenue: model.bigNumber(),
  })
  .indexes([{ on: ['placement_id', 'kind'] }])
