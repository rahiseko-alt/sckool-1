/**
 * テストの採点とボーナスの換算（要件32、受け入れ基準 E3・E4・E5）。
 *
 * **採点は必ずサーバー側で行う。** 得点がそのまま資金になるので、
 * ブラウザに正解を渡すと、開発者ツールを開くだけで資金を作れてしまう。
 * ここは純粋な関数だけで、問題そのものは持たない（持ち主は service.ts）。
 */

/** 出題の1問。`correctIndex` は**サーバーの中だけ**にとどめる。 */
export interface Question {
  id: string
  /** 選択肢のうち正解の位置。0から数える。 */
  correctIndex: number
}

/** 生徒が画面で見る1問。**正解を含めない**（受け入れ基準 E4）。 */
export interface PublicQuestion {
  id: string
  prompt: string
  choices: string[]
}

/** 得点からボーナス額への換算表（要件32）。管理者が変えられる（受け入れ基準 E5）。 */
export interface RewardTier {
  /** この点以上なら、この額。 */
  minScore: number
  amount: number
}

/**
 * 既定の換算表（要件32の例）。
 *
 * **1回のボーナスが企業活動の平均支出を下回るようにする**（要件32）。
 * テストを受け続ければ商品を売らなくても経営できる、という状態にしないため。
 */
export const DEFAULT_REWARD_TIERS: RewardTier[] = [
  { minScore: 90, amount: 1_500 },
  { minScore: 80, amount: 1_000 },
  { minScore: 60, amount: 500 },
  { minScore: 0, amount: 0 },
]

export interface GradeResult {
  /** 100点満点。 */
  score: number
  correctCount: number
  totalCount: number
}

/**
 * 採点する。
 *
 * 答えていない問題は不正解として数える。空欄を「採点対象外」にすると、
 * 分かる問題だけ答えて満点を取れてしまう。
 */
export function grade(
  questions: readonly Question[],
  answers: Readonly<Record<string, unknown>>,
): GradeResult {
  const totalCount = questions.length
  if (totalCount === 0) return { score: 0, correctCount: 0, totalCount: 0 }

  const correctCount = questions.filter(
    (question) => answers[question.id] === question.correctIndex,
  ).length

  return {
    correctCount,
    totalCount,
    // 小数の点は使わない。表示も判定も整数に揃える。
    score: Math.round((correctCount / totalCount) * 100),
  }
}

/** 得点からボーナス額を決める。表は上から順に見る。 */
export function rewardFor(score: number, tiers: readonly RewardTier[] = DEFAULT_REWARD_TIERS): number {
  const sorted = [...tiers].sort((a, b) => b.minScore - a.minScore)
  return sorted.find((tier) => score >= tier.minScore)?.amount ?? 0
}

/** 換算表の壊れ方。**画面が訳せるように、文ではなく符号で返す。** */
export type RewardTierProblemCode =
  | 'not_a_list'
  | 'empty'
  | 'not_an_object'
  | 'score_out_of_range'
  | 'amount_negative'
  | 'missing_zero'
  | 'duplicate_score'
  | 'not_monotonic'

/** 見つかった問題1件。`value` はその原因になった数（あるとき）。 */
export interface RewardTierProblem {
  code: RewardTierProblemCode
  value?: number
}

/** 表として使える最大の行数。多すぎる表は打ち間違いか、貼り付けの事故。 */
const MAX_TIERS = 20

/**
 * 換算表として使える形か調べる（受け入れ基準 E5）。
 *
 * **画面から送られてくる何が入っているか分からない値をそのまま受け取る。**
 * 形が違うものを先に弾かないと、採点の途中で止まる。
 *
 * 問題が無ければ空の配列。
 */
export function findRewardTierProblems(input: unknown): RewardTierProblem[] {
  if (!Array.isArray(input)) return [{ code: 'not_a_list' }]
  if (input.length === 0) return [{ code: 'empty' }]
  if (input.length > MAX_TIERS) return [{ code: 'not_a_list' }]

  const problems: RewardTierProblem[] = []
  const scores: number[] = []

  for (const row of input) {
    if (row === null || typeof row !== 'object') {
      problems.push({ code: 'not_an_object' })
      continue
    }

    const { minScore, amount } = row as { minScore?: unknown; amount?: unknown }

    if (!Number.isInteger(minScore) || (minScore as number) < 0 || (minScore as number) > 100) {
      problems.push({
        code: 'score_out_of_range',
        ...(typeof minScore === 'number' ? { value: minScore } : {}),
      })
    } else {
      scores.push(minScore as number)
    }

    if (!Number.isInteger(amount) || (amount as number) < 0) {
      problems.push({
        code: 'amount_negative',
        ...(typeof amount === 'number' ? { value: amount } : {}),
      })
    }
  }

  // 形が壊れている行がある間は、並び順まで見ても意味が無い。
  if (problems.length > 0) return problems

  // 0点のときの額が決まっていないと、低い点の扱いが宙に浮く。
  if (!scores.includes(0)) problems.push({ code: 'missing_zero' })

  const duplicate = scores.find((score, index) => scores.indexOf(score) !== index)
  if (duplicate !== undefined) problems.push({ code: 'duplicate_score', value: duplicate })

  /**
   * 点が高いほうが額が少ない表を断る。作れてしまうと、生徒は
   * 「頑張るほど損をする」画面を見ることになる。
   */
  const sorted = [...(input as RewardTier[])].sort((a, b) => a.minScore - b.minScore)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.amount < sorted[index - 1]!.amount) {
      problems.push({ code: 'not_monotonic', value: sorted[index]!.minScore })
      break
    }
  }

  return problems
}

/**
 * 換算表として使える形か。管理者が壊れた表を入れると採点が止まる。
 *
 * 問題があれば日本語の文で返す。空配列なら使ってよい。
 * **画面に出すときは `findRewardTierProblems` の符号を使うこと**
 * （こちらは日本語しか出せない）。
 */
export function checkRewardTiers(tiers: readonly RewardTier[]): string[] {
  return findRewardTierProblems(tiers).map((problem) => {
    switch (problem.code) {
      case 'not_a_list':
      case 'not_an_object':
        return '換算表の形が違います'
      case 'empty':
        return '換算表が空です'
      case 'score_out_of_range':
        return `得点 ${problem.value} は0から100の整数にしてください`
      case 'amount_negative':
        return `ボーナス ${problem.value} は0以上の整数にしてください`
      case 'missing_zero':
        return '0点のときのボーナスが決まっていません'
      case 'duplicate_score':
        return `得点 ${problem.value} が2回出てきます`
      case 'not_monotonic':
        return '得点が高いほうのボーナスが少なくなっています'
    }
  })
}

/** ボーナスが使える日数の上限。1年を超える設定は打ち間違いとみなす。 */
export const MAX_BONUS_VALID_DAYS = 365

/** ボーナスが使える日数として入れてよい値か（受け入れ基準 E2 の期限）。 */
export function isValidBonusValidDays(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_BONUS_VALID_DAYS
}

/**
 * 問題を、生徒に渡してよい形に落とす（受け入れ基準 E4）。
 *
 * **この関数を通さずに問題を返してはいけない。** 通し忘れると正解が漏れる。
 */
export function toPublicQuestion(question: Question & { prompt: string; choices: string[] }): PublicQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    choices: question.choices,
  }
}
