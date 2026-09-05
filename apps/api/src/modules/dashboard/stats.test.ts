import { describe, expect, it } from 'vitest'

import type { LedgerEntry } from '../mp/ledger'
import {
  calculateStats,
  countCustomers,
  dailyRevenue,
  fillMissingDays,
  salesByListing,
} from './stats'

let counter = 0
function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  counter += 1
  return {
    id: `e${counter}`,
    organizationId: 'org-a',
    amount: 0,
    kind: 'sale',
    pocket: 'normal',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  }
}

describe('経営成績（受け入れ基準 G1）', () => {
  it('売上・支出・利益を履歴から出す', () => {
    const stats = calculateStats([
      entry({ amount: 100_000, kind: 'initial_grant' }),
      entry({ amount: 5_000, kind: 'sale', reference: 'lst-1' }),
      entry({ amount: 3_000, kind: 'sale', reference: 'lst-2' }),
      entry({ amount: -2_000, kind: 'purchase', reference: 'lst-9' }),
      entry({ amount: -1_000, kind: 'ad_spend', reference: 'lst-1' }),
    ])

    expect(stats.revenue).toBe(8_000)
    expect(stats.expenses).toBe(3_000)
    expect(stats.profit).toBe(5_000)
    expect(stats.ad_spend).toBe(1_000)
  })

  it('初期資金とボーナスは売上に数えない', () => {
    const stats = calculateStats([
      entry({ amount: 100_000, kind: 'initial_grant' }),
      entry({ amount: 1_500, kind: 'bonus_grant', pocket: 'bonus' }),
    ])
    expect(stats.revenue).toBe(0)
    expect(stats.profit).toBe(0)
  })

  it('利益率は売上に対する割合（小数第1位まで）', () => {
    const stats = calculateStats([
      entry({ amount: 10_000, kind: 'sale', reference: 'lst-1' }),
      entry({ amount: -3_000, kind: 'purchase', reference: 'lst-9' }),
    ])
    expect(stats.profit_margin).toBe(70)
  })

  it('売上が0でも壊れない（NaN を出さない）', () => {
    const stats = calculateStats([entry({ amount: -1_000, kind: 'ad_spend' })])
    expect(stats.profit_margin).toBe(0)
    expect(Number.isFinite(stats.profit_margin)).toBe(true)
  })

  it('赤字なら利益率が負になる', () => {
    const stats = calculateStats([
      entry({ amount: 1_000, kind: 'sale', reference: 'lst-1' }),
      entry({ amount: -3_000, kind: 'purchase', reference: 'lst-9' }),
    ])
    expect(stats.profit).toBe(-2_000)
    expect(stats.profit_margin).toBe(-200)
  })

  it('1回の購入がボーナスと通常に分かれても1件と数える', () => {
    const stats = calculateStats([
      entry({ amount: -1_500, kind: 'purchase', pocket: 'bonus', reference: 'lst-9', groupId: 'g1' }),
      entry({ amount: -500, kind: 'purchase', pocket: 'normal', reference: 'lst-9', groupId: 'g1' }),
    ])
    expect(stats.purchase_count).toBe(1)
    expect(stats.expenses).toBe(2_000)
  })

  it('同じ商品を2回買ったら2件と数える', () => {
    // 商品の id で数えると1件に潰れる。実際にその間違いをして、
    // 動いているサーバーの検査で見つかった。
    const stats = calculateStats([
      entry({ amount: -3_000, kind: 'purchase', reference: 'lst-9', groupId: 'g1' }),
      entry({ amount: -3_000, kind: 'purchase', reference: 'lst-9', groupId: 'g2' }),
    ])
    expect(stats.purchase_count).toBe(2)
    expect(stats.expenses).toBe(6_000)
  })

  it('印が無い行は、その行を1件として数える', () => {
    const stats = calculateStats([
      entry({ amount: -1_000, kind: 'purchase', reference: 'lst-9' }),
      entry({ amount: -1_000, kind: 'purchase', reference: 'lst-9' }),
    ])
    expect(stats.purchase_count).toBe(2)
  })

  it('履歴が空なら全て0', () => {
    const stats = calculateStats([])
    expect(stats).toEqual({
      revenue: 0,
      expenses: 0,
      profit: 0,
      profit_margin: 0,
      sales_count: 0,
      purchase_count: 0,
      ad_spend: 0,
    })
  })
})

describe('商品ごとの売上', () => {
  it('同じ商品の売上をまとめる', () => {
    const totals = salesByListing([
      entry({ amount: 2_500, kind: 'sale', reference: 'lst-1' }),
      entry({ amount: 2_500, kind: 'sale', reference: 'lst-1' }),
      entry({ amount: 3_000, kind: 'sale', reference: 'lst-2' }),
    ])
    expect(totals.get('lst-1')).toBe(5_000)
    expect(totals.get('lst-2')).toBe(3_000)
  })
})

describe('顧客数', () => {
  it('同じ相手が何度買っても1社と数える', () => {
    expect(countCustomers(['org-b', 'org-b', 'org-c'])).toBe(2)
  })
})

describe('日ごとの売上（グラフ用）', () => {
  it('日付ごとにまとめて古い順に並べる', () => {
    const points = dailyRevenue([
      entry({ amount: 1_000, kind: 'sale', createdAt: new Date('2026-09-02T10:00:00Z') }),
      entry({ amount: 2_000, kind: 'sale', createdAt: new Date('2026-09-01T10:00:00Z') }),
      entry({ amount: 500, kind: 'sale', createdAt: new Date('2026-09-02T20:00:00Z') }),
    ])
    expect(points).toEqual([
      { date: '2026-09-01', revenue: 2_000 },
      { date: '2026-09-02', revenue: 1_500 },
    ])
  })

  it('売れなかった日は0で埋める', () => {
    // 埋めないと、売れなかった日が詰められて右肩上がりに見える。
    const filled = fillMissingDays(
      [{ date: '2026-09-01', revenue: 1_000 }, { date: '2026-09-04', revenue: 2_000 }],
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-09-04T00:00:00Z'),
    )
    expect(filled).toEqual([
      { date: '2026-09-01', revenue: 1_000 },
      { date: '2026-09-02', revenue: 0 },
      { date: '2026-09-03', revenue: 0 },
      { date: '2026-09-04', revenue: 2_000 },
    ])
  })
})
