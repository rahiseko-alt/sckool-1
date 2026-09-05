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
import { pickQuizTranslation, type QuizTranslation } from './translation'

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

/**
 * 先生に見せるテスト（受け入れ基準 E5・I3）。
 *
 * 換算表を直すためには問題文・正解は要らないが、**翻訳を入れるには原文の
 * 題名・題目・設問・選択肢が要る**（何を訳すのか見えないと訳せない）。
 * そこで**正解（correctIndex）は除いた**原文と、いま入っている訳を渡す。
 * 正解は含めないので、先生の画面から漏れても生徒に正解は伝わらない。
 */
export interface AdminQuiz {
  id: string
  title: string
  topic: string
  question_count: number
  reward_tiers: RewardTier[]
  bonus_valid_days: number
  is_open: boolean
  /** 原文の設問（正解を含まない）。翻訳の入力欄を作るのに使う。 */
  questions: PublicQuestion[]
  /** いま入っている各言語の訳。 */
  translations: QuizTranslation[]
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

  private translationsOf(row: any): QuizTranslation[] {
    const t = row.translations as QuizTranslation[] | null | undefined
    return Array.isArray(t) ? t : []
  }

  /**
   * 生徒に見せる形にする。**正解を落とすのはここだけ**なので必ず通す。
   * `locale` を渡すと、その言語の訳を当てる。無ければ原文（受け入れ基準 I3）。
   */
  private toPublic(row: any, locale?: string): PublicQuiz {
    const questions = this.storedQuestions(row)
    const tiers = this.tiersOf(row)
    const publicQuestions = questions.map((question) => toPublicQuestion(question))

    // 正解を含まない原文だけを翻訳の材料にする（correctIndex はここに渡さない）。
    const display = pickQuizTranslation(
      { title: row.title, topic: row.topic, questions: publicQuestions },
      this.translationsOf(row),
      locale,
    )

    return {
      id: row.id,
      title: display.title,
      topic: display.topic,
      question_count: questions.length,
      max_reward: Math.max(...tiers.map((tier) => tier.amount)),
      bonus_valid_days: Number(row.bonus_valid_days),
      is_open: Boolean(row.is_open),
      questions: display.questions,
    }
  }

  /** 受けられるテストの一覧。`locale` があればその言語で見せる。 */
  async listOpenQuizzes(locale?: string): Promise<PublicQuiz[]> {
    const rows = await this.listQuizzes({ is_open: true })
    return rows.map((row) => this.toPublic(row, locale))
  }

  /** 1件を、生徒に見せる形で引く。`locale` があればその言語で見せる。 */
  async findPublicQuiz(id: string, locale?: string): Promise<PublicQuiz | undefined> {
    const [row] = await this.listQuizzes({ id })
    return row ? this.toPublic(row, locale) : undefined
  }

  /**
   * 先生の画面に出す一覧（受け入れ基準 E5）。
   *
   * **問題文と正解は出さない。** 換算表を直すのに要らないうえ、
   * 先生の画面から漏れれば生徒の画面から漏れたのと変わらない。
   */
  async listForAdmin(): Promise<AdminQuiz[]> {
    const rows = await this.listQuizzes({})
    return rows.map((row) => this.toAdmin(row))
  }

  /** 1件を先生の画面向けに引く（翻訳の編集に使う）。 */
  async findAdminQuiz(id: string): Promise<AdminQuiz | undefined> {
    const [row] = await this.listQuizzes({ id })
    return row ? this.toAdmin(row) : undefined
  }

  /** 先生に見せる形。**正解（correctIndex）は含めない。** */
  private toAdmin(row: any): AdminQuiz {
    const questions = this.storedQuestions(row)
    return {
      id: row.id,
      title: row.title,
      topic: row.topic,
      question_count: questions.length,
      reward_tiers: this.tiersOf(row),
      bonus_valid_days: Number(row.bonus_valid_days),
      is_open: Boolean(row.is_open),
      questions: questions.map((question) => toPublicQuestion(question)),
      translations: this.translationsOf(row),
    }
  }

  /**
   * 原文（正解を含まない）を返す。翻訳を保存する前の検査に使う
   * （選択肢の数が原文と合っているかを確かめるため）。
   */
  async originalForTranslation(
    id: string,
  ): Promise<{ title: string; topic: string; questions: PublicQuestion[] } | undefined> {
    const [row] = await this.listQuizzes({ id })
    if (!row) return undefined
    return {
      title: row.title,
      topic: row.topic,
      questions: this.storedQuestions(row).map((q) => toPublicQuestion(q)),
    }
  }

  /**
   * 各言語の訳を保存する（受け入れ基準 I3）。
   * **検査（`checkQuizTranslations`）を通した値を、正規化してから渡すこと。**
   * ここは保存するだけで、選択肢の数などの判定はしない。
   */
  async saveTranslations(id: string, translations: QuizTranslation[]): Promise<AdminQuiz | undefined> {
    const [row] = await this.listQuizzes({ id })
    if (!row) return undefined
    await this.updateQuizzes({ id, translations })
    const [updated] = await this.listQuizzes({ id })
    return updated ? this.toAdmin(updated) : undefined
  }

  /**
   * 換算表などを書き換える（受け入れ基準 E5）。
   *
   * **検査を通した値だけを渡すこと**（`findRewardTierProblems`）。
   * ここは保存するだけで、形の判定はしない。
   */
  async updateSettings(
    id: string,
    patch: {
      reward_tiers?: RewardTier[]
      bonus_valid_days?: number
      is_open?: boolean
    },
  ): Promise<AdminQuiz | undefined> {
    const [row] = await this.listQuizzes({ id })
    if (!row) return undefined

    await this.updateQuizzes({ id, ...patch })
    const [updated] = await this.listQuizzes({ id })
    if (!updated) return undefined

    return this.toAdmin(updated)
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
