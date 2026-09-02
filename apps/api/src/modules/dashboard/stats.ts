import type { LedgerEntry } from '../mp/ledger'

/**
 * 経営ダッシュボードの数字（要件16、受け入れ基準 G1）。
 *
 * **すべて取引履歴から計算する。** どこかに集計値を保存すると、
 * 履歴と食い違ったときにどちらが正しいか分からなくなる。
 * 「ダッシュボードの数字と履歴を手で合計した数が一致する」ことが受け入れ基準。
 *
 * 純粋な関数だけを置く。
 */

export interface OrganizationStats {
  /** 売れた金額の合計。 */
  revenue: number
  /** 出ていった金額の合計（商品の購入 + 広告費）。 */
  expenses: number
  /** 売上 − 支出。 */
  profit: number
  /** 売上に対する利益の割合。売上が0なら0。 */
  profit_margin: number
  /** 売れた件数。 */
  sales_count: number
  /** 買った件数。 */
  purchase_count: number
  /** 広告に使った額。 */
  ad_spend: number
}

/**
 * 履歴から企業の成績を出す。
 *
 * 初期資金とボーナスは**売上に数えない**。配られたものであって、
 * 売って得たものではない。ここを混ぜると「売れる仕組みを作る」という
 * 授業の狙い（要件1）から数字がずれる。
 */
export function calculateStats(entries: readonly LedgerEntry[]): OrganizationStats {
  let revenue = 0
  let purchaseSpend = 0
  let adSpend = 0
  let salesCount = 0
  let purchaseCount = 0

  for (const entry of entries) {
    switch (entry.kind) {
      case 'sale':
        revenue += entry.amount
        salesCount += 1
        break
      case 'purchase':
        purchaseSpend += -entry.amount
        // 件数は行では数えない（1回の購入が2行に分かれることがある）。下で数え直す。
        break
      case 'ad_spend':
        adSpend += -entry.amount
        break
      default:
        // 初期資金・ボーナス・失効・取り消しは成績に数えない。
        break
    }
  }

  /**
   * 購入の件数は `groupId` で数える。
   *
   * **商品の id で数えてはいけない。** 1回の購入がボーナスと通常の2行に
   * 分かれるので行では数えられないが、商品の id にすると
   * **同じ商品を2回買ったときに1件へ潰れる**（実際にそう間違えた）。
   * 印が無い古い行は、行そのものを1件として数える。
   */
  purchaseCount = new Set(
    entries
      .filter((entry) => entry.kind === 'purchase')
      .map((entry) => entry.groupId ?? entry.id),
  ).size

  const expenses = purchaseSpend + adSpend
  const profit = revenue - expenses

  return {
    revenue,
    expenses,
    profit,
    // 売上が0のときに割り算をすると NaN になる。画面に出せないので0にする。
    profit_margin: revenue === 0 ? 0 : Math.round((profit / revenue) * 1000) / 10,
    sales_count: salesCount,
    purchase_count: purchaseCount,
    ad_spend: adSpend,
  }
}

/** 商品ごとの売上（要件16）。 */
export function salesByListing(entries: readonly LedgerEntry[]): Map<string, number> {
  const totals = new Map<string, number>()

  for (const entry of entries) {
    if (entry.kind !== 'sale' || !entry.reference) continue
    totals.set(entry.reference, (totals.get(entry.reference) ?? 0) + entry.amount)
  }

  return totals
}

/**
 * 何社に売れたか（要件16の「顧客数」）。
 *
 * 履歴だけからは買い手が分からないので、呼ぶ側が「その商品を誰が買ったか」を
 * 渡す。ここは数えるだけ。
 */
export function countCustomers(buyerIdsPerSale: readonly string[]): number {
  return new Set(buyerIdsPerSale).size
}

/** 日ごとの売上（グラフ用、要件16）。 */
export function dailyRevenue(entries: readonly LedgerEntry[]): { date: string; revenue: number }[] {
  const byDay = new Map<string, number>()

  for (const entry of entries) {
    if (entry.kind !== 'sale') continue
    const date = entry.createdAt.toISOString().slice(0, 10)
    byDay.set(date, (byDay.get(date) ?? 0) + entry.amount)
  }

  return [...byDay.entries()]
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 売上が無かった日も0として埋める。
 *
 * 抜けたまま線を引くと、売れなかった日が詰められて右肩上がりに見える。
 * 生徒が結果を読み違えるので、必ず埋める。
 */
export function fillMissingDays(
  points: readonly { date: string; revenue: number }[],
  from: Date,
  to: Date,
): { date: string; revenue: number }[] {
  const known = new Map(points.map((point) => [point.date, point.revenue]))
  const filled: { date: string; revenue: number }[] = []

  for (
    let day = new Date(from.toISOString().slice(0, 10));
    day <= to;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const date = day.toISOString().slice(0, 10)
    filled.push({ date, revenue: known.get(date) ?? 0 })
  }

  return filled
}
