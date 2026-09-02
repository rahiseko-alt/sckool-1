import { model } from '@medusajs/framework/utils'

/**
 * 先生が画面から変えた数字を1件ずつ保存する（`docs/requirements.md` 第2部の前書き）。
 *
 * **1行に1つの数字を入れる形にする。** 数字をまとめて1行に入れると、
 * 設定を1つ足すたびに保存の形が変わり、古い行を読めなくなる。
 *
 * 保存が無い数字は既定値を使う（`defaults.ts`）。**この表が空でも仕組みは動く。**
 *
 * **この表に個人情報の列を足してはいけない**（受け入れ基準 A3）。
 */
export const MarketSetting = model
  .define('market_setting', {
    id: model.id({ prefix: 'mset' }).primaryKey(),

    /** `initial_funds` などの名前。`defaults.ts` の MARKET_SETTING_KEYS と同じ綴り。 */
    key: model.text().searchable(),

    /**
     * その数字。
     *
     * 4つとも整数なので `number` にしてある。数字以外を設定に足すときは、
     * この列を増やすのではなく**別の表を作る**こと。1つの列にいろいろな型を
     * 入れると、読み出す側が毎回「これは何か」を確かめる羽目になる。
     */
    value: model.number(),
  })
  // 同じ名前が2行あると、どちらが効いているか分からなくなる。
  .indexes([{ on: ['key'], unique: true }])
