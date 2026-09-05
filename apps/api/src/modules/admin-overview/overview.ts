import { calculateStats } from '../dashboard/stats'
import { calculateBalance, type LedgerEntry } from '../mp/ledger'

/**
 * 管理者が全企業を1画面で見るための集計（要件26、受け入れ基準 H1）。
 *
 * **企業ダッシュボード（G1）と同じ関数で数える。** ここで別の数え方をすると、
 * 「先生の画面と自分の画面で数字が違う」という状態が起き、どちらが正しいか
 * 生徒には確かめようがない。だから売上・利益は `calculateStats`、残高は
 * `calculateBalance` をそのまま使い、この file は並べ替えと合計だけを持つ。
 *
 * データベースにも HTTP にも触らない純粋な関数だけを置く。
 */

/** 一覧の1行。管理者だけが見る。 */
export interface OverviewRow {
  /**
   * Market ID。**この画面にだけ出す。**
   * 生徒に見せる画面では企業名だけにする（要件38）が、管理者はパスワードの
   * 初期化（受け入れ基準 A5）に Market ID が要るので、ここでは出す。
   */
  market_id: string
  organization_name: string
  balance_normal: number
  balance_bonus: number
  balance_total: number
  revenue: number
  expenses: number
  profit: number
  profit_margin: number
  /** 出品している商品の数。 */
  listing_count: number
  /** 広告に使った額。 */
  ad_spend: number
}

/** 1社ぶんの行を作る。 */
export function buildOverviewRow(input: {
  marketId: string
  organizationName: string
  entries: readonly LedgerEntry[]
  listingCount: number
  now?: Date
}): OverviewRow {
  const balance = calculateBalance(input.entries, input.now ?? new Date())
  const stats = calculateStats(input.entries)

  return {
    market_id: input.marketId,
    organization_name: input.organizationName,
    balance_normal: balance.normal,
    balance_bonus: balance.bonus,
    balance_total: balance.total,
    revenue: stats.revenue,
    expenses: stats.expenses,
    profit: stats.profit,
    profit_margin: stats.profit_margin,
    listing_count: input.listingCount,
    ad_spend: stats.ad_spend,
  }
}

/** 並べ替えに使える列。 */
export const SORT_KEYS = [
  'organization_name',
  'balance_total',
  'revenue',
  'expenses',
  'profit',
  'profit_margin',
  'listing_count',
  'ad_spend',
] as const

export type SortKey = (typeof SORT_KEYS)[number]

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value)
}

/**
 * 一覧を並べ替える。
 *
 * 数字は大きい順、企業名だけ五十音・アルファベット順にする。
 * 「売上が多い順」と「名前が Z から」が混ざると、管理者が毎回並び順を
 * 確かめ直すことになる。
 *
 * 元の配列は変えない。呼ぶ側が同じ配列を別の順で使うことがある。
 */
export function sortOverview<T extends OverviewRow>(rows: readonly T[], key: SortKey): T[] {
  const sorted = [...rows]

  if (key === 'organization_name') {
    sorted.sort((a, b) => a.organization_name.localeCompare(b.organization_name, 'ja'))
    return sorted
  }

  sorted.sort((a, b) => b[key] - a[key])
  return sorted
}

/** 市場全体の合計。 */
export interface OverviewTotals {
  organizations: number
  balance_total: number
  revenue: number
  profit: number
  ad_spend: number
  listing_count: number
}

/**
 * 市場全体の合計を出す。
 *
 * 残高の合計は、配った MP から失効した分を引いた額と一致するはず。
 * ずれていたら、どこかで片側だけの行を書いている（受け入れ基準 B3・K1）。
 * 管理者がその場で気づけるように、合計を画面に出す。
 */
export function overviewTotals(rows: readonly OverviewRow[]): OverviewTotals {
  return rows.reduce<OverviewTotals>(
    (totals, row) => ({
      organizations: totals.organizations + 1,
      balance_total: totals.balance_total + row.balance_total,
      revenue: totals.revenue + row.revenue,
      profit: totals.profit + row.profit,
      ad_spend: totals.ad_spend + row.ad_spend,
      listing_count: totals.listing_count + row.listing_count,
    }),
    {
      organizations: 0,
      balance_total: 0,
      revenue: 0,
      profit: 0,
      ad_spend: 0,
      listing_count: 0,
    },
  )
}

/** MP の勘定が合っているか（受け入れ基準 B3・K1）。 */
export interface SupplyCheck {
  /** 全企業の残高を足した額。 */
  balances_total: number
  /** 全企業の取引履歴の金額を足した額。 */
  ledger_total: number
  /**
   * 期限が切れているのに、失効の行をまだ書いていないボーナス。
   *
   * 残高からは既に外れているが履歴にはまだ残っているので、
   * この額のぶんだけ**合計が食い違って当たり前**。差の理由がこれで
   * 説明できるかどうかが、勘定が合っているかの判断になる。
   */
  unswept_expired_bonus: number
  /** 説明できない差が無いこと。false なら片側だけの行を書いている。 */
  matches: boolean
  /**
   * どの企業のものでもない MP。
   *
   * 動作確認用に作った口座など、企業として登録されていない相手の分。
   * 0 でなくても直ちに異常ではないが、授業中に増えるなら調べる手がかりになる。
   */
  unassigned: number
}

/**
 * 勘定が合っているかを調べる。
 *
 * **「残高の合計 = 履歴の合計」をそのまま比べない。** 期限切れのボーナスは
 * 残高から先に外れ、失効の行はあとから書かれるため、その間だけ必ずずれる。
 * ずれの理由を先に見積もり、それで説明できるかを見る。
 */
export function checkSupply(input: {
  balancesTotal: number
  ledgerTotal: number
  unsweptExpiredBonus: number
  marketCirculating: number
}): SupplyCheck {
  return {
    balances_total: input.balancesTotal,
    ledger_total: input.ledgerTotal,
    unswept_expired_bonus: input.unsweptExpiredBonus,
    matches: input.balancesTotal + input.unsweptExpiredBonus === input.ledgerTotal,
    unassigned: input.marketCirculating - input.ledgerTotal,
  }
}
