import { model } from '@medusajs/framework/utils'

/**
 * 生徒の企業が市場に出す商品（要件5・6）。
 *
 * Medusa の `product` を使わず別に持つ理由:
 *
 *   - 要件6の必須項目（ターゲット顧客・解決する課題・販売期間）が Medusa には無い。
 *     `metadata` に入れると、必須にすることも検索することもできない
 *   - 価格は MP の整数で、通貨も税も配送も要らない。Medusa の価格は
 *     通貨・地域・税を前提にしていて、外せない
 *   - 「誰のどんな課題を解決する商品か」が授業の中心（要件5）なので、
 *     その2項目を欠かせない列として持ちたい
 *
 * **この表に個人情報の列を足してはいけない**（受け入れ基準 A3）。
 * 出品者は `organization_id`（企業）で持ち、生徒個人には一切結びつけない。
 */
export const Listing = model
  .define('listing', {
    id: model.id({ prefix: 'lst' }).primaryKey(),

    /** 出品している企業。表示は企業名だけ（要件38）。 */
    organization_id: model.text().searchable(),

    title: model.text().searchable(),
    description: model.text(),

    /** 誰に向けた商品か（要件6）。 */
    target_customer: model.text(),

    /** どんな課題を解決するか（要件6）。 */
    problem_solved: model.text(),

    /** MP の整数。小数も0も負も入れない（受け入れ基準 C3）。 */
    price: model.bigNumber(),

    /** あと何個売れるか。買われるたびに1減る（受け入れ基準 D4）。 */
    available_quantity: model.number(),

    image_url: model.text(),

    sale_starts_at: model.dateTime(),
    sale_ends_at: model.dateTime(),
  })
  .indexes([
    // 市場一覧は「いま買えるもの」を並べるので、期間で絞り込む。
    { on: ['sale_starts_at', 'sale_ends_at'] },
    { on: ['organization_id'] },
  ])
