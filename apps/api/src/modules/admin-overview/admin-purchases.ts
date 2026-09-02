import type { Trade } from './trade-analysis'

/**
 * 管理者（先生）の購入ログ（要件10・22、受け入れ基準 H4）。
 *
 * 先生は「買うだけの参加者」として市場に外から需要を持ち込む。
 * 誰が誰からいくら買ったかを**先生どうしが互いに見られる**ようにすることで、
 * 贔屓や偏りが起きにくくなる。生徒には見せない。
 *
 * データベースにも HTTP にも触らない純粋な関数だけを置く。
 */

/** ある先生が、ある企業からいくら買ったか。 */
export interface SellerBreakdown {
  sellerId: string
  amount: number
  count: number
}

/** 先生1人ぶんのまとめ。 */
export interface AdminPurchaseSummary {
  adminId: string
  /** 買った回数。 */
  purchaseCount: number
  /** 買った額の合計。 */
  totalAmount: number
  /** 買った先ごとの内訳。額の多い順。 */
  sellers: SellerBreakdown[]
  /** 一番多く買っている企業が占める割合（百分率、小数第1位まで）。 */
  concentrationRate: number
}

/**
 * 先生ごとに購入をまとめる。
 *
 * `adminIds` に渡した先生は、**1回も買っていなくても行として返す**。
 * 買っていない人が一覧から消えると、「まだ誰も買っていない」のか
 * 「その人がいない」のかを先生が区別できない。
 *
 * 買った額の多い順に返す。
 */
export function summarizeAdminPurchases(
  trades: readonly Trade[],
  adminIds: readonly string[],
): AdminPurchaseSummary[] {
  const byAdmin = new Map<string, Map<string, SellerBreakdown>>()
  for (const adminId of adminIds) byAdmin.set(adminId, new Map())

  for (const trade of trades) {
    const perSeller = byAdmin.get(trade.buyerId)
    // 先生でない買い手（生徒の企業）はここでは数えない。
    if (!perSeller) continue

    const current = perSeller.get(trade.sellerId) ?? {
      sellerId: trade.sellerId,
      amount: 0,
      count: 0,
    }
    current.amount += trade.amount
    current.count += 1
    perSeller.set(trade.sellerId, current)
  }

  const summaries: AdminPurchaseSummary[] = []
  for (const [adminId, perSeller] of byAdmin) {
    const sellers = [...perSeller.values()].sort((a, b) => b.amount - a.amount)
    const totalAmount = sellers.reduce((sum, seller) => sum + seller.amount, 0)
    const purchaseCount = sellers.reduce((sum, seller) => sum + seller.count, 0)

    summaries.push({
      adminId,
      purchaseCount,
      totalAmount,
      sellers,
      // 1回も買っていなければ0。割り算で NaN を出さない。
      concentrationRate:
        totalAmount === 0 ? 0 : Math.round((sellers[0]!.amount / totalAmount) * 1000) / 10,
    })
  }

  return summaries.sort((a, b) => b.totalAmount - a.totalAmount)
}

/** 企業ごとに「先生からいくら買われたか」。贔屓が特定の企業に集まっていないかを見る。 */
export interface SellerFromAdmins {
  sellerId: string
  amount: number
  count: number
  /** 何人の先生から買われたか。1人だけなら偏っている。 */
  adminCount: number
}

/**
 * 先生からの購入を、売った企業ごとにまとめる（要件22の「企業別購入額」）。
 *
 * 額の多い順に返す。**先生の人数も返す**のは、
 * 「1人の先生がたくさん買った」と「みんなが少しずつ買った」を見分けるため。
 */
export function sellersFromAdmins(
  trades: readonly Trade[],
  adminIds: readonly string[],
): SellerFromAdmins[] {
  const admins = new Set(adminIds)
  const bySeller = new Map<string, { amount: number; count: number; admins: Set<string> }>()

  for (const trade of trades) {
    if (!admins.has(trade.buyerId)) continue
    const current = bySeller.get(trade.sellerId) ?? { amount: 0, count: 0, admins: new Set() }
    current.amount += trade.amount
    current.count += 1
    current.admins.add(trade.buyerId)
    bySeller.set(trade.sellerId, current)
  }

  return [...bySeller.entries()]
    .map(([sellerId, value]) => ({
      sellerId,
      amount: value.amount,
      count: value.count,
      adminCount: value.admins.size,
    }))
    .sort((a, b) => b.amount - a.amount)
}
