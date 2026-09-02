import { model } from '@medusajs/framework/utils'

/**
 * MP の取引履歴。**この表は追記しかしない**（受け入れ基準 K3）。
 *
 * 更新も削除もしないのは、売上・利益・ランキングの全てがこの表の合計だから。
 * 1行でも書き換わると、過去の数字が黙って変わる。取り消しは
 * 反対向きの行（kind = reversal）を足して表す。
 *
 * 残高の列を持たないのは、二重に持つと必ずずれるため。残高は毎回この表から数える
 * （受け入れ基準 B3）。数え方は ledger.ts の calculateBalance。
 *
 * **この表に個人情報の列を足してはいけない**（受け入れ基準 A3）。
 * 自分で作った表なので、列があるだけで scripts/check-no-personal-data.mjs が落ちる。
 */
export const MpLedgerEntry = model.define('mp_ledger_entry', {
  id: model.id({ prefix: 'mpl' }).primaryKey(),

  /** どの企業の履歴か。企業＝Mercur の seller。 */
  organization_id: model.text().searchable(),

  /** 増えるときは正、減るときは負。MP は整数だけ（受け入れ基準 C3）。 */
  amount: model.bigNumber(),

  /** 何が起きたか。金額の符号ではなく出来事として残す。 */
  kind: model.enum([
    'initial_grant',
    'bonus_grant',
    'bonus_expired',
    'purchase',
    'sale',
    'ad_spend',
    'reversal',
  ]),

  /** どちらの残高か。bonus は期限つきで、支払いに先に使う。 */
  pocket: model.enum(['normal', 'bonus']),

  /** ボーナスが使えなくなる時刻。pocket が bonus のときだけ入る。 */
  expires_at: model.dateTime().nullable(),

  /**
   * 何によるものか。商品の id、テストの id、取り消しなら元の行の id。
   * 相手の企業名は入れない（表示のたびに企業の表から引く）。
   */
  reference: model.text().nullable(),

  /**
   * ひとつの出来事を指す印。
   *
   * 1回の購入が「ボーナスから」「通常から」の2行に分かれることがあるので、
   * **行を数えても購入の件数にはならない**。かといって商品の id で数えると、
   * 同じ商品を2回買ったときに1件に潰れる（実際にそう間違えた）。
   * 出来事ごとに別の値を入れて、これで数える。
   */
  group_id: model.text().nullable(),
})
