import { model } from '@medusajs/framework/utils'

/**
 * 生徒が経営する仮想企業（要件2）。
 *
 * 市場に出るのは**企業名だけ**で、誰が動かしているかは出さない（要件38）。
 * 「○○君の商品だから買う」を弱めるための作りで、仲良し取引の対策にもなる。
 *
 * **この表に個人情報の列を足してはいけない**（受け入れ基準 A3）。
 * 自分で作った表なので、列があるだけで scripts/check-no-personal-data.mjs が落ちる。
 * 生徒と企業の対応は学校側が紙で持つ（要件37）。
 */
export const Organization = model
  .define('organization', {
    id: model.id({ prefix: 'org' }).primaryKey(),

    /**
     * 匿名アカウントの識別子。これが企業の持ち主。
     * MP の履歴もこの値で引く（mp_ledger_entry.organization_id）。
     */
    market_id: model.text().searchable(),

    /** 市場に表示する名前。1〜40文字で、他社と重ならない（受け入れ基準 B1）。 */
    name: model.text().searchable(),
  })
  // 企業名の重複は、画面の検査だけでは同時に登録されたときに抜ける。
  // データベース側でも重ならないようにする。
  .indexes([
    { on: ['market_id'], unique: true },
    { on: ['name'], unique: true },
  ])
