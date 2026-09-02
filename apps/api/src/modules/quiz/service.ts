import { MedusaService } from '@medusajs/framework/utils'

import {
  DEFAULT_REWARD_TIERS,
  grade,
  rewardFor,
  toPublicQuestion,
  type PublicQuestion,
  type Question,
  type RewardTier,
} from './grading'
import { Quiz, QuizAttempt } from './models/quiz'

/** 保存されている1問。正解を含む。**そのまま返さないこと。** */
interface StoredQuestion extends Question {
  prompt: string
  choices: string[]
}

/** 生徒に見せるテスト。正解は含まない（受け入れ基準 E4）。 */
export interface PublicQuiz {
  id: string
  title: string
  topic: string
  question_count: number
  /** この回で取れる最高額。受ける前に分かるようにしておく（要件42）。 */
  max_reward: number
  bonus_valid_days: number
  is_open: boolean
  questions: PublicQuestion[]
}

export interface SubmitResult {
  score: number
  correct_count: number
  total_count: number
  /** 今回もらえた額。2回目以降は0。 */
  reward_amount: number
  /** すでに1回もらっているか（受け入れ基準 E3）。 */
  already_rewarded: boolean
  bonus_expires_at?: Date
}

/**
 * テストの出題と採点（要件32、受け入れ基準 E3・E4・E5）。
 *
 * **採点はここでしか行わない。** 得点がそのまま資金になるので、
 * ブラウザ側に判定を持たせない。
 */
class QuizService extends MedusaService({ Quiz, QuizAttempt }) {
  private storedQuestions(row: any): StoredQuestion[] {
    return (row.questions ?? []) as StoredQuestion[]
  }

  private tiersOf(row: any): RewardTier[] {
    const tiers = row.reward_tiers as RewardTier[] | undefined
    return tiers && tiers.length > 0 ? tiers : DEFAULT_REWARD_TIERS
  }

  /** 生徒に見せる形にする。**正解を落とすのはここだけ**なので必ず通す。 */
  private toPublic(row: any): PublicQuiz {
    const questions = this.storedQuestions(row)
    const tiers = this.tiersOf(row)

    return {
      id: row.id,
      title: row.title,
      topic: row.topic,
      question_count: questions.length,
      max_reward: Math.max(...tiers.map((tier) => tier.amount)),
      bonus_valid_days: Number(row.bonus_valid_days),
      is_open: Boolean(row.is_open),
      questions: questions.map((question) => toPublicQuestion(question)),
    }
  }

  /** 受けられるテストの一覧。 */
  async listOpenQuizzes(): Promise<PublicQuiz[]> {
    const rows = await this.listQuizzes({ is_open: true })
    return rows.map((row) => this.toPublic(row))
  }

  /** 1件を、生徒に見せる形で引く。 */
  async findPublicQuiz(id: string): Promise<PublicQuiz | undefined> {
    const [row] = await this.listQuizzes({ id })
    return row ? this.toPublic(row) : undefined
  }

  /** その企業がすでにボーナスを受け取っているか（受け入れ基準 E3）。 */
  async hasBeenRewarded(quizId: string, organizationId: string): Promise<boolean> {
    const attempts = await this.listQuizAttempts({
      quiz_id: quizId,
      organization_id: organizationId,
    })
    return attempts.some((attempt) => Number(attempt.reward_amount) > 0)
  }

  /**
   * 答案を採点し、ボーナス額を決めて記録する。
   *
   * **MP を実際に配るのはここではない。** 配るのは呼び出し側（API の経路）で、
   * 口座の扱いは mp モジュールに任せる。ここは「いくら配るか」までを決める。
   */
  async submit(input: {
    quizId: string
    organizationId: string
    answers: Record<string, unknown>
    now?: Date
  }): Promise<SubmitResult | undefined> {
    const [row] = await this.listQuizzes({ id: input.quizId })
    if (!row) return undefined

    const now = input.now ?? new Date()
    const questions = this.storedQuestions(row)
    const result = grade(questions, input.answers)

    const alreadyRewarded = await this.hasBeenRewarded(input.quizId, input.organizationId)
    // 2回目以降も受験はできる（復習のため）が、ボーナスは出さない。
    const rewardAmount = alreadyRewarded ? 0 : rewardFor(result.score, this.tiersOf(row))

    await this.createQuizAttempts({
      quiz_id: input.quizId,
      organization_id: input.organizationId,
      score: result.score,
      reward_amount: rewardAmount,
    })

    const validDays = Number(row.bonus_valid_days)
    const expiresAt = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000)

    return {
      score: result.score,
      correct_count: result.correctCount,
      total_count: result.totalCount,
      reward_amount: rewardAmount,
      already_rewarded: alreadyRewarded,
      ...(rewardAmount > 0 ? { bonus_expires_at: expiresAt } : {}),
    }
  }
}

export default QuizService
