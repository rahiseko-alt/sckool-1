import { describe, expect, it } from 'vitest'

import type { LedgerEntry } from '../mp/ledger'
import {
  buildTrades,
  mutualTradeRates,
  purchaseConcentrations,
  type Trade,
} from './trade-analysis'

const NOW = new Date('2026-09-02T00:00:00Z')

let counter = 0
function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  counter += 1
  return {
    id: `e${counter}`,
    organizationId: 'A',
    amount: 0,
    kind: 'sale',
    pocket: 'normal',
    createdAt: NOW,
    ...over,
  }
}

/** 1回の売買を、実際に記録される形（買う側の行 + 売る側の行）で作る。 */
function transfer(buyer: string, seller: string, amount: number, groupId: string): LedgerEntry[] {
  return [
    entry({ organizationId: buyer, amount: -amount, kind: 'purchase', groupId }),
    entry({ organizationId: seller, amount, kind: 'sale', groupId }),
  ]
}

describe('取引履歴から売買の組を戻す', () => {
  it('買う側と売る側を印で結び直す', () => {
    expect(buildTrades(transfer('A', 'B', 2_500, 'g1'))).toEqual([
      { buyerId: 'A', sellerId: 'B', amount: 2_500 },
    ])
  })

  it('ボーナスと通常に分かれた購入も1件に戻す', () => {
    const entries = [
      entry({ organizationId: 'A', amount: -1_500, kind: 'purchase', pocket: 'bonus', groupId: 'g1' }),
      entry({ organizationId: 'A', amount: -500, kind: 'purchase', groupId: 'g1' }),
      entry({ organizationId: 'B', amount: 2_000, kind: 'sale', groupId: 'g1' }),
    ]
    expect(buildTrades(entries)).toEqual([{ buyerId: 'A', sellerId: 'B', amount: 2_000 }])
  })

  it('相手のいない支払い（広告費）は取り出さない', () => {
    const entries = [
      entry({ organizationId: 'A', amount: -1_500, kind: 'ad_spend', groupId: 'g9' }),
      ...transfer('A', 'B', 1_000, 'g1'),
    ]
    expect(buildTrades(entries)).toEqual([{ buyerId: 'A', sellerId: 'B', amount: 1_000 }])
  })

  it('印の無い行は組に戻さない', () => {
    // 間違った組を作るより、数えないほうが安全。
    const entries = [
      entry({ organizationId: 'A', amount: -1_000, kind: 'purchase' }),
      entry({ organizationId: 'B', amount: 1_000, kind: 'sale' }),
    ]
    expect(buildTrades(entries)).toEqual([])
  })

  it('同じ相手から2回買えば2件になる', () => {
    const entries = [...transfer('A', 'B', 1_000, 'g1'), ...transfer('A', 'B', 1_000, 'g2')]
    expect(buildTrades(entries)).toHaveLength(2)
  })
})

describe('相互取引率（受け入れ基準 H2）', () => {
  it('互いとしか取引していない2社は50%になる', () => {
    // 両社の総取引額に同じ額が2回入るため、100%にはならない。
    // しきい値30%はこの前提で置いてある。
    const trades: Trade[] = [
      { buyerId: 'A', sellerId: 'B', amount: 3_000 },
      { buyerId: 'B', sellerId: 'A', amount: 3_000 },
    ]
    const [pair] = mutualTradeRates(trades)
    expect(pair).toMatchObject({ a: 'A', b: 'B', between: 6_000, total: 12_000, rate: 50 })
    expect(pair!.flagged).toBe(true)
  })

  it('買い合っている組はしきい値を超える', () => {
    const trades: Trade[] = [
      // A と B が互いに買い合う
      { buyerId: 'A', sellerId: 'B', amount: 5_000 },
      { buyerId: 'B', sellerId: 'A', amount: 5_000 },
      // それぞれ他社とも少し取引する
      { buyerId: 'A', sellerId: 'C', amount: 1_000 },
      { buyerId: 'C', sellerId: 'B', amount: 1_000 },
    ]
    const flagged = mutualTradeRates(trades).filter((pair) => pair.flagged)
    expect(flagged).toHaveLength(1)
    expect(flagged[0]).toMatchObject({ a: 'A', b: 'B' })
  })

  it('広く取引している組はしきい値を超えない', () => {
    const trades: Trade[] = [
      { buyerId: 'A', sellerId: 'B', amount: 1_000 },
      { buyerId: 'A', sellerId: 'C', amount: 1_000 },
      { buyerId: 'A', sellerId: 'D', amount: 1_000 },
      { buyerId: 'B', sellerId: 'C', amount: 1_000 },
      { buyerId: 'B', sellerId: 'D', amount: 1_000 },
      { buyerId: 'C', sellerId: 'D', amount: 1_000 },
    ]
    expect(mutualTradeRates(trades).every((pair) => !pair.flagged)).toBe(true)
  })

  it('同じ組が向きの違いで2つに分かれない', () => {
    const trades: Trade[] = [
      { buyerId: 'B', sellerId: 'A', amount: 1_000 },
      { buyerId: 'A', sellerId: 'B', amount: 1_000 },
    ]
    expect(mutualTradeRates(trades)).toHaveLength(1)
  })

  it('率の高い順に並ぶ', () => {
    const trades: Trade[] = [
      { buyerId: 'A', sellerId: 'B', amount: 10_000 },
      { buyerId: 'C', sellerId: 'D', amount: 1_000 },
      { buyerId: 'C', sellerId: 'E', amount: 9_000 },
    ]
    const rates = mutualTradeRates(trades).map((pair) => pair.rate)
    expect(rates).toEqual([...rates].sort((x, y) => y - x))
  })

  it('しきい値は変えられる', () => {
    const trades: Trade[] = [{ buyerId: 'A', sellerId: 'B', amount: 1_000 }]
    expect(mutualTradeRates(trades, 60)[0]!.flagged).toBe(false)
    expect(mutualTradeRates(trades, 40)[0]!.flagged).toBe(true)
  })

  it('取引が1件も無ければ空', () => {
    expect(mutualTradeRates([])).toEqual([])
  })
})

describe('購入集中率（受け入れ基準 H3）', () => {
  it('1社に偏った企業は率が高く出る', () => {
    const trades: Trade[] = [
      { buyerId: 'A', sellerId: 'B', amount: 9_000 },
      { buyerId: 'A', sellerId: 'C', amount: 1_000 },
    ]
    expect(purchaseConcentrations(trades)[0]).toEqual({
      organizationId: 'A',
      topSellerId: 'B',
      topAmount: 9_000,
      totalAmount: 10_000,
      rate: 90,
      sellerCount: 2,
    })
  })

  it('1社からしか買っていなければ100%', () => {
    const result = purchaseConcentrations([{ buyerId: 'A', sellerId: 'B', amount: 1_000 }])
    expect(result[0]!.rate).toBe(100)
    // 「まだ1回しか買っていないだけ」を見分けられるように数も返す。
    expect(result[0]!.sellerCount).toBe(1)
    expect(result[0]!.totalAmount).toBe(1_000)
  })

  it('同じ相手から複数回買った分はまとめる', () => {
    const trades: Trade[] = [
      { buyerId: 'A', sellerId: 'B', amount: 1_000 },
      { buyerId: 'A', sellerId: 'B', amount: 1_000 },
      { buyerId: 'A', sellerId: 'C', amount: 1_000 },
    ]
    expect(purchaseConcentrations(trades)[0]).toMatchObject({ topAmount: 2_000, rate: 66.7 })
  })

  it('買っていない企業は出てこない', () => {
    const trades: Trade[] = [{ buyerId: 'A', sellerId: 'B', amount: 1_000 }]
    expect(purchaseConcentrations(trades).map((row) => row.organizationId)).toEqual(['A'])
  })

  it('率の高い順に並ぶ', () => {
    const trades: Trade[] = [
      { buyerId: 'A', sellerId: 'B', amount: 5_000 },
      { buyerId: 'A', sellerId: 'C', amount: 5_000 },
      { buyerId: 'D', sellerId: 'B', amount: 5_000 },
    ]
    expect(purchaseConcentrations(trades).map((row) => row.organizationId)).toEqual(['D', 'A'])
  })
})
