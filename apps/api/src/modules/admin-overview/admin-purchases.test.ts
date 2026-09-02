import { describe, expect, it } from 'vitest'

import { sellersFromAdmins, summarizeAdminPurchases } from './admin-purchases'
import type { Trade } from './trade-analysis'

const AT = new Date('2026-09-02T00:00:00Z')

function trade(buyerId: string, sellerId: string, amount: number): Trade {
  return { buyerId, sellerId, amount, at: AT }
}

describe('先生ごとの購入ログ（受け入れ基準 H4）', () => {
  it('誰がどこからいくら何回買ったかをまとめる', () => {
    const summaries = summarizeAdminPurchases(
      [
        trade('teacher-1', 'ORG-A', 3_000),
        trade('teacher-1', 'ORG-A', 2_000),
        trade('teacher-1', 'ORG-B', 1_000),
      ],
      ['teacher-1'],
    )

    expect(summaries[0]).toEqual({
      adminId: 'teacher-1',
      purchaseCount: 3,
      totalAmount: 6_000,
      sellers: [
        { sellerId: 'ORG-A', amount: 5_000, count: 2 },
        { sellerId: 'ORG-B', amount: 1_000, count: 1 },
      ],
      concentrationRate: 83.3,
    })
  })

  it('1回も買っていない先生も行として残す', () => {
    // 消えると「まだ誰も買っていない」のか「その人がいない」のか分からない。
    const summaries = summarizeAdminPurchases([], ['teacher-1', 'teacher-2'])
    expect(summaries).toHaveLength(2)
    expect(summaries[0]).toMatchObject({ purchaseCount: 0, totalAmount: 0, concentrationRate: 0 })
  })

  it('買っていなくても割り算で NaN を出さない', () => {
    const [summary] = summarizeAdminPurchases([], ['teacher-1'])
    expect(Number.isFinite(summary!.concentrationRate)).toBe(true)
  })

  it('生徒どうしの取引は数えない', () => {
    const summaries = summarizeAdminPurchases(
      [trade('ORG-X', 'ORG-Y', 5_000), trade('teacher-1', 'ORG-Y', 1_000)],
      ['teacher-1'],
    )
    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.totalAmount).toBe(1_000)
  })

  it('1社からしか買っていない先生は100%', () => {
    const [summary] = summarizeAdminPurchases([trade('teacher-1', 'ORG-A', 1_000)], ['teacher-1'])
    expect(summary!.concentrationRate).toBe(100)
  })

  it('買った額の多い先生から並ぶ', () => {
    const summaries = summarizeAdminPurchases(
      [trade('teacher-1', 'ORG-A', 1_000), trade('teacher-2', 'ORG-A', 9_000)],
      ['teacher-1', 'teacher-2'],
    )
    expect(summaries.map((summary) => summary.adminId)).toEqual(['teacher-2', 'teacher-1'])
  })
})

describe('企業ごとの「先生から買われた額」（要件22）', () => {
  it('額と回数と、買った先生の人数を出す', () => {
    const result = sellersFromAdmins(
      [
        trade('teacher-1', 'ORG-A', 3_000),
        trade('teacher-2', 'ORG-A', 2_000),
        trade('teacher-1', 'ORG-B', 1_000),
      ],
      ['teacher-1', 'teacher-2'],
    )

    expect(result).toEqual([
      { sellerId: 'ORG-A', amount: 5_000, count: 2, adminCount: 2 },
      { sellerId: 'ORG-B', amount: 1_000, count: 1, adminCount: 1 },
    ])
  })

  it('1人の先生が繰り返し買っても人数は1', () => {
    // 「1人がたくさん買った」と「みんなが少しずつ買った」を見分けるため。
    const [row] = sellersFromAdmins(
      [trade('teacher-1', 'ORG-A', 1_000), trade('teacher-1', 'ORG-A', 1_000)],
      ['teacher-1'],
    )
    expect(row).toEqual({ sellerId: 'ORG-A', amount: 2_000, count: 2, adminCount: 1 })
  })

  it('生徒どうしの取引は数えない', () => {
    expect(sellersFromAdmins([trade('ORG-X', 'ORG-Y', 5_000)], ['teacher-1'])).toEqual([])
  })
})
