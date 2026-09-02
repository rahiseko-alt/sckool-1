import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { QUIZ_MODULE } from '../../../modules/quiz'
import type QuizService from '../../../modules/quiz/service'

/**
 * 受けられるテストの一覧（要件32・42）。
 *
 * 画面は「Knowledge Challenge / 10 questions / Reward Up to 1,500 MP」のような
 * 見せ方にする（要件42）。教材風にしないため、受ける前に問題数と最高額を出す。
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const quiz = req.scope.resolve(QUIZ_MODULE) as QuizService
  const quizzes = await quiz.listOpenQuizzes()

  res.status(200).json({
    // 一覧では問題そのものを出さない。開いたときに取りに行く。
    quizzes: quizzes.map(({ questions, ...rest }) => rest),
    count: quizzes.length,
  })
}
