import { describe, expect, it } from 'vitest'

import {
  checkRewardTiers,
  DEFAULT_REWARD_TIERS,
  findRewardTierProblems,
  grade,
  isValidBonusValidDays,
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

describe('画面から送られてくる換算表の検査（受け入れ基準 E5）', () => {
  const codes = (input: unknown) => findRewardTierProblems(input).map((problem) => problem.code)

  it('既定の表は問題ない', () => {
    expect(findRewardTierProblems(DEFAULT_REWARD_TIERS)).toEqual([])
  })

  it('配列でないものは断る', () => {
    expect(codes(null)).toEqual(['not_a_list'])
    expect(codes({ minScore: 0, amount: 0 })).toEqual(['not_a_list'])
    expect(codes('60点で500MP')).toEqual(['not_a_list'])
  })

  it('空の表は断る', () => {
    expect(codes([])).toEqual(['empty'])
  })

  it('行が数の組でなければ断る', () => {
    expect(codes([1, 2])).toEqual(['not_an_object', 'not_an_object'])
    expect(codes([{ minScore: '60', amount: '500' }])).toEqual([
      'score_out_of_range',
      'amount_negative',
    ])
  })

  it('得点が0から100の外なら断る', () => {
    expect(codes([{ minScore: 101, amount: 100 }])).toEqual(['score_out_of_range'])
    expect(codes([{ minScore: -1, amount: 100 }])).toEqual(['score_out_of_range'])
    expect(codes([{ minScore: 60.5, amount: 100 }])).toEqual(['score_out_of_range'])
    expect(findRewardTierProblems([{ minScore: 101, amount: 100 }])[0]?.value).toBe(101)
  })

  it('ボーナスが負なら断る', () => {
    expect(codes([{ minScore: 0, amount: -100 }])).toEqual(['amount_negative'])
    expect(codes([{ minScore: 0, amount: 1.5 }])).toEqual(['amount_negative'])
  })

  it('0点の行が無ければ断る', () => {
    expect(codes([{ minScore: 60, amount: 500 }])).toEqual(['missing_zero'])
  })

  it('同じ得点が2回あれば断る', () => {
    expect(
      codes([
        { minScore: 0, amount: 0 },
        { minScore: 60, amount: 500 },
        { minScore: 60, amount: 800 },
      ]),
    ).toEqual(['duplicate_score'])
  })

  it('点が高いほうのボーナスが少ない表は断る', () => {
    // 頑張るほど損をする表になる。作れてしまうと授業の狙いが崩れる。
    expect(
      codes([
        { minScore: 0, amount: 0 },
        { minScore: 60, amount: 1_000 },
        { minScore: 90, amount: 500 },
      ]),
    ).toEqual(['not_monotonic'])
  })

  it('同じ額が続く表は認める', () => {
    expect(
      codes([
        { minScore: 0, amount: 0 },
        { minScore: 60, amount: 500 },
        { minScore: 90, amount: 500 },
      ]),
    ).toEqual([])
  })

  it('行が多すぎる表は断る', () => {
    const many = Array.from({ length: 21 }, (_, index) => ({ minScore: index, amount: index }))
    expect(codes(many)).toEqual(['not_a_list'])
  })
})

describe('ボーナスが使える日数', () => {
  it('1日から365日までを認める', () => {
    expect(isValidBonusValidDays(1)).toBe(true)
    expect(isValidBonusValidDays(7)).toBe(true)
    expect(isValidBonusValidDays(365)).toBe(true)
  })

  it('0日・366日・小数・数でないものは断る', () => {
    expect(isValidBonusValidDays(0)).toBe(false)
    expect(isValidBonusValidDays(366)).toBe(false)
    expect(isValidBonusValidDays(1.5)).toBe(false)
    expect(isValidBonusValidDays('7')).toBe(false)
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
