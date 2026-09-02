import { Module } from '@medusajs/framework/utils'

import QuizService from './service'

/**
 * 授業内の確認テストと、その結果に応じたボーナス（要件32・33）。
 *
 * 狙いは「勉強すると経営上少し有利になる」こと。ゲーム要素を足すのではなく、
 * 学習 → 資源獲得 → 経営判断 → 市場結果 を一続きにするためのもの。
 */
export const QUIZ_MODULE = 'quiz'

export default Module(QUIZ_MODULE, {
  service: QuizService,
})

export { QuizService }
export * from './grading'
export type { PublicQuiz, SubmitResult } from './service'
