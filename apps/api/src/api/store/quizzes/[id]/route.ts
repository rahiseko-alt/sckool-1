import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { QUIZ_MODULE } from '../../../../modules/quiz'
import type QuizService from '../../../../modules/quiz/service'

/**
 * テストの問題を取りに行く（受け入れ基準 E4）。
 *
 * **この応答に正解を含めない。** 得点がそのまま資金になるので、
 * 正解が混ざると、開発者ツールを開くだけで満点を取れてしまう。
 * 正解を落とすのは service.ts の1箇所だけにしてある。
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
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

  res.status(200).json({ quiz })
}
