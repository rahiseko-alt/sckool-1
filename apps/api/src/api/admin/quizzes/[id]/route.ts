import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { findRewardTierProblems, isValidBonusValidDays, QUIZ_MODULE } from '../../../../modules/quiz'
import type { RewardTier } from '../../../../modules/quiz/grading'
import type QuizService from '../../../../modules/quiz/service'

/**
 * 先生が得点からボーナスへの換算表を変える（受け入れ基準 E5）。
 *
 * **壊れた表は保存しない。** 保存できてしまうと、生徒が答案を出した瞬間に
 * 採点が止まる。判定は純粋な関数（`findRewardTierProblems`）に任せ、
 * ここは受け取りと返しだけを行う。
 *
 * 返すのは文ではなく符号。画面が6言語で出せるようにするため。
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = (req.params as { id?: string }).id
  if (!id) {
    res.status(400).json({ code: 'quiz_id_required' })
    return
  }

  const body = (req.body ?? {}) as {
    reward_tiers?: unknown
    bonus_valid_days?: unknown
    is_open?: unknown
  }

  const patch: {
    reward_tiers?: RewardTier[]
    bonus_valid_days?: number
    is_open?: boolean
  } = {}

  if (body.reward_tiers !== undefined) {
    const problems = findRewardTierProblems(body.reward_tiers)
    if (problems.length > 0) {
      res.status(400).json({ code: 'invalid_reward_tiers', problems })
      return
    }
    patch.reward_tiers = body.reward_tiers as RewardTier[]
  }

  if (body.bonus_valid_days !== undefined) {
    // 画面の入力欄は文字列を返す。数に直せるものは受け取る。
    const days = Number(body.bonus_valid_days)
    if (!isValidBonusValidDays(days)) {
      res.status(400).json({ code: 'invalid_bonus_valid_days' })
      return
    }
    patch.bonus_valid_days = days
  }

  if (body.is_open !== undefined) {
    if (typeof body.is_open !== 'boolean') {
      res.status(400).json({ code: 'invalid_is_open' })
      return
    }
    patch.is_open = body.is_open
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ code: 'nothing_to_change' })
    return
  }

  const quizzes = req.scope.resolve(QUIZ_MODULE) as QuizService
  const updated = await quizzes.updateSettings(id, patch)
  if (!updated) {
    res.status(404).json({ code: 'quiz_not_found', quiz_id: id })
    return
  }

  res.status(200).json({ quiz: updated })
}
