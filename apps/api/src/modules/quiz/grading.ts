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

/**
 * 換算表として使える形か。管理者が壊れた表を入れると採点が止まる。
 *
 * 問題があればその内容を返す。空配列なら使ってよい。
 */
export function checkRewardTiers(tiers: readonly RewardTier[]): string[] {
  const problems: string[] = []

  if (tiers.length === 0) {
    problems.push('換算表が空です')
    return problems
  }

  for (const tier of tiers) {
    if (!Number.isInteger(tier.minScore) || tier.minScore < 0 || tier.minScore > 100) {
      problems.push(`得点 ${tier.minScore} は0から100の整数にしてください`)
    }
    if (!Number.isInteger(tier.amount) || tier.amount < 0) {
      problems.push(`ボーナス ${tier.amount} は0以上の整数にしてください`)
    }
  }

  // 0点のときの額が決まっていないと、低い点の扱いが宙に浮く。
  if (!tiers.some((tier) => tier.minScore === 0)) {
    problems.push('0点のときのボーナスが決まっていません')
  }

  return problems
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
