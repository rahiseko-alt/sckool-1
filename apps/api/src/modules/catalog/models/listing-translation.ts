import { model } from '@medusajs/framework/utils'

/**
 * 商品名と説明の翻訳（要件34、受け入れ基準 I3）。
 *
 * Medusa の Translation Module は使わない。経路も読み出しも動かせなかったため
 * （`docs/decisions.md`「32.」）。
 *
 * **原文は `listing` が持ち、この表は訳だけを持つ。** 原文をこちらに複製すると、
 * 商品名を直したときに片方だけ変わって食い違う。
 *
 * **この表に個人情報の列を足してはいけない**（受け入れ基準 A3）。
 * 誰が訳したかも持たない。企業の単位までで十分で、それ以上は要らない。
 */
export const ListingTranslation = model
  .define('listing_translation', {
    id: model.id({ prefix: 'ltr' }).primaryKey(),

    /** どの商品の訳か。 */
    listing_id: model.text().searchable(),

    /** どの言語の訳か（`en` / `zh-CN` など）。 */
    locale_code: model.text().searchable(),

    /** 訳した商品名。空なら原文を出す。 */
    title: model.text(),

    /** 訳した説明。空なら原文を出す。 */
    description: model.text(),
  })
  // 同じ商品・同じ言語の訳が2つできると、どちらを出すか決められない。
  .indexes([{ on: ['listing_id', 'locale_code'], unique: true }])
