import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { QUIZ_MODULE } from '../../../modules/quiz'
import type QuizService from '../../../modules/quiz/service'

/**
 * 先生がテストの一覧を見る（受け入れ基準 E5）。
 *
 * 換算表（得点 → ボーナス）はテストごとに持っているので、
 * 直すには「どのテストか」を選ぶ画面が要る。
 *
 * **問題文と正解は返さない。** 換算表を直すのに要らないうえ、
 * 先生の画面から漏れれば生徒の画面から漏れたのと変わらない。
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const quizzes = req.scope.resolve(QUIZ_MODULE) as QuizService

  res.status(200).json({ quizzes: await quizzes.listForAdmin() })
}
