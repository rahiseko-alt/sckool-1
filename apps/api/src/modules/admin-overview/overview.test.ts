import { describe, expect, it } from 'vitest'

import type { LedgerEntry } from '../mp/ledger'
import {
  buildOverviewRow,
  checkSupply,
  isSortKey,
  overviewTotals,
  sortOverview,
  type OverviewRow,
} from './overview'

const NOW = new Date('2026-09-02T00:00:00Z')
const IN_7_DAYS = new Date('2026-09-09T00:00:00Z')

let counter = 0
function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  counter += 1
  return {
    id: `e${counter}`,
    organizationId: 'MKT-AAAA-AAAA',
    amount: 0,
    kind: 'sale',
    pocket: 'normal',
    createdAt: NOW,
    ...over,
  }
}

function row(over: Partial<OverviewRow> = {}): OverviewRow {
  return {
    market_id: 'MKT-AAAA-AAAA',
    organization_name: 'A社',
    balance_normal: 0,
    balance_bonus: 0,
    balance_total: 0,
    revenue: 0,
    expenses: 0,
    profit: 0,
    profit_margin: 0,
    listing_count: 0,
    ad_spend: 0,
    ...over,
  }
}

describe('全企業一覧の1行（受け入れ基準 H1）', () => {
  it('残高と成績を履歴から出す', () => {
    const built = buildOverviewRow({
      marketId: 'MKT-BBBB-BBBB',
      organizationName: 'ネコ工房',
      entries: [
        entry({ amount: 100_000, kind: 'initial_grant' }),
        entry({ amount: 5_000, kind: 'sale', reference: 'lst-1' }),
        entry({ amount: -2_000, kind: 'purchase', reference: 'lst-9', groupId: 'g1' }),
        entry({ amount: -1_000, kind: 'ad_spend', reference: 'lst-1' }),
      ],
      listingCount: 2,
      now: NOW,
    })

    expect(built).toEqual({
      market_id: 'MKT-BBBB-BBBB',
      organization_name: 'ネコ工房',
      balance_normal: 102_000,
      balance_bonus: 0,
      balance_total: 102_000,
      revenue: 5_000,
      expenses: 3_000,
      profit: 2_000,
      profit_margin: 40,
      listing_count: 2,
      ad_spend: 1_000,
    })
  })

  it('ボーナス残高を通常残高と分けて出す', () => {
    const built = buildOverviewRow({
      marketId: 'MKT-CCCC-CCCC',
      organizationName: 'B社',
      entries: [
        entry({ amount: 10_000, kind: 'initial_grant' }),
        entry({ amount: 1_500, kind: 'bonus_grant', pocket: 'bonus', expiresAt: IN_7_DAYS }),
      ],
      listingCount: 0,
      now: NOW,
    })

    expect(built.balance_normal).toBe(10_000)
    expect(built.balance_bonus).toBe(1_500)
    expect(built.balance_total).toBe(11_500)
    // 配られた MP は売上に数えない。企業ダッシュボードと同じ扱い。
    expect(built.revenue).toBe(0)
  })

  it('管理者の一覧には Market ID を出す', () => {
    // 生徒に見せる画面では出さない（要件38）が、管理者はパスワードの初期化に使う。
    const built = buildOverviewRow({
      marketId: 'MKT-DDDD-DDDD',
      organizationName: 'C社',
      entries: [],
      listingCount: 0,
      now: NOW,
    })
    expect(built.market_id).toBe('MKT-DDDD-DDDD')
  })

  it('履歴が無い企業でも0で並ぶ（一覧から消えない）', () => {
    const built = buildOverviewRow({
      marketId: 'MKT-EEEE-EEEE',
      organizationName: 'D社',
      entries: [],
      listingCount: 0,
      now: NOW,
    })
    expect(built.balance_total).toBe(0)
    expect(built.profit_margin).toBe(0)
  })
})

describe('並べ替え', () => {
  const rows = [
    row({ organization_name: 'あかり', revenue: 3_000, profit: 1_000 }),
    row({ organization_name: 'かがや', revenue: 9_000, profit: -500 }),
    row({ organization_name: 'さくら', revenue: 5_000, profit: 4_000 }),
  ]

  it('数字は大きい順', () => {
    expect(sortOverview(rows, 'revenue').map((r) => r.revenue)).toEqual([9_000, 5_000, 3_000])
    expect(sortOverview(rows, 'profit').map((r) => r.profit)).toEqual([4_000, 1_000, -500])
  })

  it('企業名は五十音順', () => {
    expect(sortOverview(rows, 'organization_name').map((r) => r.organization_name)).toEqual([
      'あかり',
      'かがや',
      'さくら',
    ])
  })

  it('元の並びを壊さない', () => {
    sortOverview(rows, 'revenue')
    expect(rows.map((r) => r.organization_name)).toEqual(['あかり', 'かがや', 'さくら'])
  })

  it('知らない列名は受け付けない', () => {
    expect(isSortKey('revenue')).toBe(true)
    expect(isSortKey('market_id')).toBe(false)
    expect(isSortKey('')).toBe(false)
    expect(isSortKey(undefined)).toBe(false)
  })
})

describe('市場全体の合計', () => {
  it('企業数と各項目を足す', () => {
    const totals = overviewTotals([
      row({ balance_total: 100_000, revenue: 5_000, profit: 2_000, ad_spend: 1_000, listing_count: 2 }),
      row({ balance_total: 98_000, revenue: 1_000, profit: -1_000, ad_spend: 0, listing_count: 1 }),
    ])

    expect(totals).toEqual({
      organizations: 2,
      balance_total: 198_000,
      revenue: 6_000,
      profit: 1_000,
      ad_spend: 1_000,
      listing_count: 3,
    })
  })

  it('1社も無ければ全て0', () => {
    expect(overviewTotals([])).toEqual({
      organizations: 0,
      balance_total: 0,
      revenue: 0,
      profit: 0,
      ad_spend: 0,
      listing_count: 0,
    })
  })

  it('売り買いだけでは市場全体の残高が変わらない', () => {
    // 買う側と売る側を1組で書いている限り、合計は配った額のまま（受け入れ基準 B3）。
    const buyer = buildOverviewRow({
      marketId: 'MKT-1111-1111',
      organizationName: '買う側',
      entries: [
        entry({ amount: 100_000, kind: 'initial_grant' }),
        entry({ amount: -2_500, kind: 'purchase', reference: 'lst-1', groupId: 'g1' }),
      ],
      listingCount: 0,
      now: NOW,
    })
    const seller = buildOverviewRow({
      marketId: 'MKT-2222-2222',
      organizationName: '売る側',
      entries: [
        entry({ amount: 100_000, kind: 'initial_grant' }),
        entry({ amount: 2_500, kind: 'sale', reference: 'lst-1', groupId: 'g1' }),
      ],
      listingCount: 1,
      now: NOW,
    })

    expect(overviewTotals([buyer, seller]).balance_total).toBe(200_000)
  })
})

describe('勘定が合っているかの判定（受け入れ基準 B3）', () => {
  it('残高の合計と履歴の合計が同じなら合っている', () => {
    const result = checkSupply({
      balancesTotal: 200_000,
      ledgerTotal: 200_000,
      unsweptExpiredBonus: 0,
      marketCirculating: 200_000,
    })
    expect(result.matches).toBe(true)
    expect(result.unassigned).toBe(0)
  })

  it('期限切れのボーナスぶんの差は「合っている」と見る', () => {
    // 残高からは既に外れ、失効の行はまだ書いていない状態。
    // ここを見落とすと、正常な状態を毎回「異常」と言い続けることになる。
    const result = checkSupply({
      balancesTotal: 198_500,
      ledgerTotal: 200_000,
      unsweptExpiredBonus: 1_500,
      marketCirculating: 200_000,
    })
    expect(result.matches).toBe(true)
  })

  it('説明できない差があれば合っていない', () => {
    // 片側だけの行を書くと、こうなる。
    const result = checkSupply({
      balancesTotal: 197_500,
      ledgerTotal: 200_000,
      unsweptExpiredBonus: 0,
      marketCirculating: 200_000,
    })
    expect(result.matches).toBe(false)
  })

  it('企業でない相手の MP は別に数える', () => {
    // 動作確認用の口座が混ざっていても、企業どうしの勘定は合っていると言える。
    const result = checkSupply({
      balancesTotal: 200_000,
      ledgerTotal: 200_000,
      unsweptExpiredBonus: 0,
      marketCirculating: 300_000,
    })
    expect(result.matches).toBe(true)
    expect(result.unassigned).toBe(100_000)
  })
})
