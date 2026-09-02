import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { MP_MODULE } from '../../../../../modules/mp'
import type MpService from '../../../../../modules/mp/service'
import { marketIdOf } from '../../../../../modules/market-auth/token'
import { ORGANIZATION_MODULE } from '../../../../../modules/organization'
import type OrganizationService from '../../../../../modules/organization/service'
import { QUIZ_MODULE } from '../../../../../modules/quiz'
import type QuizService from '../../../../../modules/quiz/service'

/**
 * 答案を出して採点してもらう（要件32、受け入れ基準 E3・E4・E5）。
 *
 * 採点はサーバーの中だけで行う。ボーナスは期限つきで、同じテストからは
 * 1回しか出ない。
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { answers?: unknown }
  // 受験する企業は**合鍵から決める**。本文の market_id は読まない。
  const marketId = marketIdOf(req)
  const answers =
    typeof body.answers === 'object' && body.answers !== null
      ? (body.answers as Record<string, unknown>)
      : {}


  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const organization = await organizations.findByMarketId(marketId)
  if (!organization) {
    res.status(404).json({ code: 'organization_not_found' })
    return
  }

  const quizService = req.scope.resolve(QUIZ_MODULE) as QuizService
  const quiz = await quizService.findPublicQuiz(req.params.id)
  if (!quiz) {
    res.status(404).json({ code: 'quiz_not_found' })
    return
  }
  if (!quiz.is_open) {
    res.status(409).json({ code: 'quiz_closed' })
    return
  }

  const result = await quizService.submit({
    quizId: req.params.id,
    organizationId: marketId,
    answers,
  })

  if (!result) {
    res.status(404).json({ code: 'quiz_not_found' })
    return
  }

  // 実際に MP を配るのはここ。採点役に口座を触らせない。
  if (result.reward_amount > 0 && result.bonus_expires_at) {
    const mp = req.scope.resolve(MP_MODULE) as MpService
    await mp.grantBonus({
      organizationId: marketId,
      amount: result.reward_amount,
      expiresAt: result.bonus_expires_at,
      reference: req.params.id,
    })
  }

  const mp = req.scope.resolve(MP_MODULE) as MpService

  res.status(200).json({
    score: result.score,
    correct_count: result.correct_count,
    total_count: result.total_count,
    reward_amount: result.reward_amount,
    already_rewarded: result.already_rewarded,
    ...(result.bonus_expires_at ? { bonus_expires_at: result.bonus_expires_at } : {}),
    balance: await mp.getBalance(marketId),
  })
}
