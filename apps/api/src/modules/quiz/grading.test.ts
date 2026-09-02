import { describe, expect, it } from 'vitest'

import {
  checkRewardTiers,
  DEFAULT_REWARD_TIERS,
  grade,
  rewardFor,
  toPublicQuestion,
  type Question,
} from './grading'

/** 10問の出題。正解はすべて位置0にしてある。 */
const questions: Question[] = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i}`,
  correctIndex: 0,
}))

/** 指定した数だけ正解する答案を作る。 */
function answersWith(correct: number): Record<string, number> {
  return Object.fromEntries(questions.map((q, i) => [q.id, i < correct ? 0 : 1]))
}

describe('採点', () => {
  it('全問正解は100点', () => {
    expect(grade(questions, answersWith(10))).toEqual({
      score: 100,
      correctCount: 10,
      totalCount: 10,
    })
  })

  it('9問正解は90点', () => {
    expect(grade(questions, answersWith(9)).score).toBe(90)
  })

  it('全問不正解は0点', () => {
    expect(grade(questions, answersWith(0)).score).toBe(0)
  })

  it('答えていない問題は不正解として数える', () => {
    // 空欄を採点対象から外すと、分かる問題だけ答えて満点を取れてしまう。
    expect(grade(questions, { q0: 0 }).score).toBe(10)
    expect(grade(questions, {}).score).toBe(0)
  })

  it('選択肢の位置が違えば不正解', () => {
    expect(grade([{ id: 'q0', correctIndex: 2 }], { q0: 1 }).correctCount).toBe(0)
    expect(grade([{ id: 'q0', correctIndex: 2 }], { q0: 2 }).correctCount).toBe(1)
  })

  it('文字列の数字は正解にしない', () => {
    // 型がゆるいと「"0" と 0 が同じ」になり、送り方次第で点が変わる。
    expect(grade([{ id: 'q0', correctIndex: 0 }], { q0: '0' }).correctCount).toBe(0)
  })

  it('問題が0問なら0点', () => {
    expect(grade([], {})).toEqual({ score: 0, correctCount: 0, totalCount: 0 })
  })

  it('点は整数になる（3問中2問なら67点）', () => {
    const three: Question[] = [
      { id: 'a', correctIndex: 0 },
      { id: 'b', correctIndex: 0 },
      { id: 'c', correctIndex: 0 },
    ]
    expect(grade(three, { a: 0, b: 0, c: 1 }).score).toBe(67)
  })
})

describe('ボーナスの換算（要件32）', () => {
  it.each([
    [100, 1_500],
    [90, 1_500],
    [89, 1_000],
    [80, 1_000],
    [79, 500],
    [60, 500],
    [59, 0],
    [0, 0],
  ])('%s点なら %sMP', (score, amount) => {
    expect(rewardFor(score)).toBe(amount)
  })

  it('管理者が決めた表を使える（受け入れ基準 E5）', () => {
    const tiers = [
      { minScore: 50, amount: 3_000 },
      { minScore: 0, amount: 100 },
    ]
    expect(rewardFor(50, tiers)).toBe(3_000)
    expect(rewardFor(49, tiers)).toBe(100)
  })

  it('1回のボーナスは企業活動の平均支出より小さい（要件32）', () => {
    // 要件32は「1期間の企業活動に5,000〜10,000MP」を想定している。
    // 最高額がそれを超えると、テストだけで経営できてしまう。
    const highest = Math.max(...DEFAULT_REWARD_TIERS.map((tier) => tier.amount))
    expect(highest).toBeLessThan(5_000)
  })
})

describe('換算表の検査', () => {
  it('既定の表は問題ない', () => {
    expect(checkRewardTiers(DEFAULT_REWARD_TIERS)).toEqual([])
  })

  it('空の表は断る', () => {
    expect(checkRewardTiers([])).toContain('換算表が空です')
  })

  it('0点のときの額が無い表は断る', () => {
    expect(checkRewardTiers([{ minScore: 60, amount: 500 }])).toContain(
      '0点のときのボーナスが決まっていません',
    )
  })

  it('範囲の外の得点は断る', () => {
    expect(checkRewardTiers([{ minScore: 101, amount: 100 }, { minScore: 0, amount: 0 }]).length)
      .toBeGreaterThan(0)
  })

  it('負のボーナスは断る', () => {
    expect(checkRewardTiers([{ minScore: 0, amount: -100 }]).length).toBeGreaterThan(0)
  })
})

describe('生徒に渡す形（受け入れ基準 E4）', () => {
  it('正解を含めない', () => {
    const publicQuestion = toPublicQuestion({
      id: 'q1',
      correctIndex: 2,
      prompt: 'カルテルとは何か',
      choices: ['A', 'B', 'C'],
    })

    expect(publicQuestion).toEqual({
      id: 'q1',
      prompt: 'カルテルとは何か',
      choices: ['A', 'B', 'C'],
    })
    // 念のため、文字列にしても正解が現れないこと。
    expect(JSON.stringify(publicQuestion)).not.toContain('correctIndex')
  })
})
