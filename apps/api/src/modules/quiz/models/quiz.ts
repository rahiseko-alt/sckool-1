import { model } from '@medusajs/framework/utils'

/**
 * 授業内で受ける確認テスト（要件32）。
 *
 * 問題と正解は `questions`（json）に入れる。**正解は生徒に渡さない**
 * （受け入れ基準 E4）。渡す形に落とすのは grading.ts の toPublicQuestion。
 *
 * 換算表もテストごとに持てるようにしてある。授業の回によって
 * 難しさが変わるため、一律の表だと合わなくなる（受け入れ基準 E5）。
 */
export const Quiz = model.define('quiz', {
  id: model.id({ prefix: 'qz' }).primaryKey(),

  title: model.text().searchable(),

  /** 何についてのテストか。「独占禁止法」など。 */
  topic: model.text(),

  /**
   * 問題の一覧。1問は
   * `{ id, prompt, choices: string[], correctIndex: number }`。
   * **correctIndex を含んだまま生徒へ返さないこと。**
   */
  questions: model.json(),

  /** 得点からボーナス額への換算表。`{ minScore, amount }` の配列。 */
  reward_tiers: model.json(),

  /**
   * 各言語の翻訳（受け入れ基準 I3 をテストに広げる）。
   * `{ locale_code, title?, topic?, questions?: [{ id, prompt, choices[] }] }` の配列。
   * **選択肢は原文と同じ数・同じ並びで持つ**（正解の位置は言語非依存のため）。
   * 訳が無ければ原文を出す。中身の選び方は translation.ts。
   */
  translations: model.json().nullable(),

  /** ボーナスが使える長さ（日）。要件32は「7日間、または次回授業終了まで」。 */
  bonus_valid_days: model.number(),

  /** 受け付けているか。授業が終わったら閉じる。 */
  is_open: model.boolean(),
})

/**
 * 誰がどのテストで何点だったか（受け入れ基準 E3）。
 *
 * **同じテストからボーナスを受け取れるのは1回だけ。** 2回目以降も
 * 受験そのものはできる（復習のため）が、ボーナスは出さない。
 *
 * **この表に個人情報の列を足してはいけない**（受け入れ基準 A3）。
 * 生徒ではなく企業（organization_id）に結びつける。
 */
export const QuizAttempt = model
  .define('quiz_attempt', {
    id: model.id({ prefix: 'qza' }).primaryKey(),
    quiz_id: model.text(),
    organization_id: model.text().searchable(),
    score: model.number(),
    /** このときに出たボーナス。2回目以降は0。 */
    reward_amount: model.number(),
  })
  .indexes([{ on: ['quiz_id', 'organization_id'] }])
