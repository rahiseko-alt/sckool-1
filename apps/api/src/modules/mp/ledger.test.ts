import { describe, expect, it } from 'vitest'

import {
  buildReversal,
  buildTransfer,
  calculateBalance,
  calculateSupply,
  findExpiredBonuses,
  planPayment,
  type LedgerEntry,
} from './ledger'

const NOW = new Date('2026-09-02T00:00:00Z')
const IN_7_DAYS = new Date('2026-09-09T00:00:00Z')
const YESTERDAY = new Date('2026-09-01T00:00:00Z')

let counter = 0
function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  counter += 1
  return {
    id: `e${counter}`,
    organizationId: 'org-a',
    amount: 0,
    kind: 'purchase',
    pocket: 'normal',
    createdAt: NOW,
    ...over,
  }
}

describe('残高の計算', () => {
  it('履歴の合計が残高になる', () => {
    const balance = calculateBalance(
      [
        entry({ amount: 100_000, kind: 'initial_grant' }),
        entry({ amount: -2_500, kind: 'purchase' }),
        entry({ amount: 3_200, kind: 'sale' }),
      ],
      NOW,
    )
    expect(balance).toEqual({ normal: 100_700, bonus: 0, total: 100_700 })
  })

  it('通常残高とボーナス残高を分けて数える', () => {
    const balance = calculateBalance(
      [
        entry({ amount: 10_000, kind: 'initial_grant' }),
        entry({ amount: 1_500, kind: 'bonus_grant', pocket: 'bonus', expiresAt: IN_7_DAYS }),
      ],
      NOW,
    )
    expect(balance).toEqual({ normal: 10_000, bonus: 1_500, total: 11_500 })
  })

  it('期限を過ぎたボーナスは数えない', () => {
    const balance = calculateBalance(
      [
        entry({ amount: 10_000, kind: 'initial_grant' }),
        entry({ amount: 1_500, kind: 'bonus_grant', pocket: 'bonus', expiresAt: YESTERDAY }),
      ],
      NOW,
    )
    expect(balance).toEqual({ normal: 10_000, bonus: 0, total: 10_000 })
  })

  it('履歴が空なら残高は0', () => {
    expect(calculateBalance([], NOW)).toEqual({ normal: 0, bonus: 0, total: 0 })
  })
})

describe('支払いの振り分け（受け入れ基準 E1）', () => {
  it('要件32の例のとおりに振り分ける', () => {
    // 通常10,000／ボーナス1,500の企業が2,000の商品を買う
    const plan = planPayment({ normal: 10_000, bonus: 1_500, total: 11_500 }, 2_000)
    expect(plan).toEqual({ fromBonus: 1_500, fromNormal: 500 })

    // 引いたあと: ボーナス0／通常9,500
    expect(10_000 - plan!.fromNormal).toBe(9_500)
    expect(1_500 - plan!.fromBonus).toBe(0)
  })

  it('ボーナスで足りるときは通常から引かない', () => {
    expect(planPayment({ normal: 10_000, bonus: 5_000, total: 15_000 }, 3_000)).toEqual({
      fromBonus: 3_000,
      fromNormal: 0,
    })
  })

  it('ボーナスが無いときは通常から引く', () => {
    expect(planPayment({ normal: 10_000, bonus: 0, total: 10_000 }, 3_000)).toEqual({
      fromBonus: 0,
      fromNormal: 3_000,
    })
  })

  it('ちょうど全額でも払える', () => {
    expect(planPayment({ normal: 500, bonus: 1_500, total: 2_000 }, 2_000)).toEqual({
      fromBonus: 1_500,
      fromNormal: 500,
    })
  })

  it('残高が足りなければ払えない（受け入れ基準 D3）', () => {
    expect(planPayment({ normal: 100, bonus: 50, total: 150 }, 200)).toBeUndefined()
  })

  it('0や負の金額、小数は払えない（受け入れ基準 C3）', () => {
    const balance = { normal: 10_000, bonus: 0, total: 10_000 }
    expect(planPayment(balance, 0)).toBeUndefined()
    expect(planPayment(balance, -100)).toBeUndefined()
    expect(planPayment(balance, 10.5)).toBeUndefined()
  })
})

describe('ボーナスの失効（受け入れ基準 E2）', () => {
  it('期限を過ぎたボーナスを見つける', () => {
    const expired = findExpiredBonuses(
      [
        entry({ id: 'b1', amount: 1_500, kind: 'bonus_grant', pocket: 'bonus', expiresAt: YESTERDAY }),
        entry({ id: 'b2', amount: 1_000, kind: 'bonus_grant', pocket: 'bonus', expiresAt: IN_7_DAYS }),
      ],
      NOW,
    )
    expect(expired).toEqual([{ entryId: 'b1', amount: 1_500 }])
  })

  it('一度失効させたものを二度失効させない', () => {
    const expired = findExpiredBonuses(
      [
        entry({ id: 'b1', amount: 1_500, kind: 'bonus_grant', pocket: 'bonus', expiresAt: YESTERDAY }),
        entry({ amount: -1_500, kind: 'bonus_expired', pocket: 'bonus', reference: 'b1' }),
      ],
      NOW,
    )
    expect(expired).toEqual([])
  })

  it('期限の無いボーナスは失効しない', () => {
    const expired = findExpiredBonuses(
      [entry({ id: 'b1', amount: 1_500, kind: 'bonus_grant', pocket: 'bonus' })],
      NOW,
    )
    expect(expired).toEqual([])
  })
})

describe('取り消し（受け入れ基準 K3）', () => {
  it('反対向きの行を作り、元の行は残す', () => {
    const original = entry({ id: 'x1', amount: -2_500, kind: 'purchase' })
    const reversal = buildReversal(original, 'r1', NOW)

    expect(reversal.amount).toBe(2_500)
    expect(reversal.kind).toBe('reversal')
    expect(reversal.reference).toBe('x1')
    // 元の行を書き換えていないこと
    expect(original.amount).toBe(-2_500)
    // 2つ合わせると残高への影響が消える
    expect(calculateBalance([original, reversal], NOW).total).toBe(0)
  })

  it('ボーナスの取り消しは期限も引き継ぐ', () => {
    const original = entry({
      id: 'x2',
      amount: -1_000,
      kind: 'purchase',
      pocket: 'bonus',
      expiresAt: IN_7_DAYS,
    })
    expect(buildReversal(original, 'r2', NOW).expiresAt).toEqual(IN_7_DAYS)
  })
})

describe('企業から企業への移動（受け入れ基準 D1・E6）', () => {
  const idFor = (i: number) => `t${i}`

  it('買った側と売った側の行が必ず対になる', () => {
    const entries = buildTransfer({
      buyerId: 'org-a',
      sellerId: 'org-b',
      plan: { fromBonus: 1_500, fromNormal: 500 },
      reference: 'order-1',
      groupId: 'g1',
      idFor,
      now: NOW,
    })

    const buyerTotal = entries
      .filter((e) => e.organizationId === 'org-a')
      .reduce((sum, e) => sum + e.amount, 0)
    const sellerTotal = entries
      .filter((e) => e.organizationId === 'org-b')
      .reduce((sum, e) => sum + e.amount, 0)

    expect(buyerTotal).toBe(-2_000)
    expect(sellerTotal).toBe(2_000)
    // 市場全体では増えも減りもしない
    expect(buyerTotal + sellerTotal).toBe(0)
  })

  it('受け取る側は必ず通常残高に入る（ボーナスは移らない）', () => {
    const entries = buildTransfer({
      buyerId: 'org-a',
      sellerId: 'org-b',
      plan: { fromBonus: 2_000, fromNormal: 0 },
      reference: 'order-2',
      groupId: 'g2',
      idFor,
      now: NOW,
    })
    const sellerEntries = entries.filter((e) => e.organizationId === 'org-b')
    expect(sellerEntries).toHaveLength(1)
    expect(sellerEntries[0]!.pocket).toBe('normal')
    expect(sellerEntries[0]!.amount).toBe(2_000)
  })

  it('ボーナスを使わないときは通常の行だけを作る', () => {
    const entries = buildTransfer({
      buyerId: 'org-a',
      sellerId: 'org-b',
      plan: { fromBonus: 0, fromNormal: 3_000 },
      reference: 'order-3',
      groupId: 'g3',
      idFor,
      now: NOW,
    })
    expect(entries).toHaveLength(2)
    expect(entries.filter((e) => e.pocket === 'bonus')).toHaveLength(0)
  })
})

describe('市場全体の MP の量', () => {
  it('売り買いでは総量が変わらない', () => {
    const entries = [
      entry({ organizationId: 'org-a', amount: 100_000, kind: 'initial_grant' }),
      entry({ organizationId: 'org-b', amount: 100_000, kind: 'initial_grant' }),
      ...buildTransfer({
        buyerId: 'org-a',
        sellerId: 'org-b',
        plan: { fromBonus: 0, fromNormal: 2_500 },
        reference: 'order-1',
        groupId: 'gs',
        idFor: (i) => `s${i}`,
        now: NOW,
      }),
    ]
    const supply = calculateSupply(entries)
    expect(supply.granted).toBe(200_000)
    expect(supply.circulating).toBe(200_000)
  })

  it('失効した分だけ総量が減る', () => {
    const entries = [
      entry({ amount: 100_000, kind: 'initial_grant' }),
      entry({ id: 'b1', amount: 1_500, kind: 'bonus_grant', pocket: 'bonus', expiresAt: YESTERDAY }),
      entry({ amount: -1_500, kind: 'bonus_expired', pocket: 'bonus', reference: 'b1' }),
    ]
    const supply = calculateSupply(entries)
    expect(supply.granted).toBe(101_500)
    expect(supply.expired).toBe(1_500)
    expect(supply.circulating).toBe(100_000)
  })
})

describe('60社が一斉に売り買いしても総量が保たれる（受け入れ基準 K1 の土台）', () => {
  it('1000回の取引のあとも合計が変わらない', () => {
    const organizations = Array.from({ length: 60 }, (_, i) => `org-${i}`)
    const entries: LedgerEntry[] = organizations.map((id) =>
      entry({ organizationId: id, amount: 100_000, kind: 'initial_grant' }),
    )

    for (let i = 0; i < 1_000; i += 1) {
      const buyer = organizations[i % 60]!
      const seller = organizations[(i + 1) % 60]!
      const balance = calculateBalance(
        entries.filter((e) => e.organizationId === buyer),
        NOW,
      )
      const plan = planPayment(balance, 100)
      if (!plan) continue
      entries.push(
        ...buildTransfer({
          buyerId: buyer,
          sellerId: seller,
          plan,
          reference: `order-${i}`,
          groupId: `g-${i}`,
          idFor: (n) => `x${i}-${n}`,
          now: NOW,
        }),
      )
    }

    expect(calculateSupply(entries).circulating).toBe(60 * 100_000)
    // どの企業も残高が負にならない
    for (const id of organizations) {
      const balance = calculateBalance(
        entries.filter((e) => e.organizationId === id),
        NOW,
      )
      expect(balance.total).toBeGreaterThanOrEqual(0)
    }
  })
})
