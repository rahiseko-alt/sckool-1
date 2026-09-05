import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { Modules } from '@medusajs/framework/utils'

import {
  sellersFromAdmins,
  summarizeAdminPurchases,
} from '../../../modules/admin-overview/admin-purchases'
import { buildTrades } from '../../../modules/admin-overview/trade-analysis'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 先生の購入ログ（要件22、受け入れ基準 H4）。
 *
 * **先生どうしが互いの購入を見られる**ようにする。見られていると分かっていれば、
 * 特定の生徒に肩入れしにくくなる。仕組みが止めるのではなく、見えるようにして防ぐ。
 *
 * この経路は `/admin` の下にあるので、生徒からは開けない。
 */

/** 新しい順に返す購入の件数の上限。全部返すと授業の終盤で重くなる。 */
const RECENT_LIMIT = 100

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const userService = req.scope.resolve(Modules.USER)
  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const mp = req.scope.resolve(MP_MODULE) as MpService

  const admins = await userService.listUsers({})
  const adminIds = admins.map((admin) => admin.id)
  const adminNameOf = new Map(admins.map((admin) => [admin.id, admin.email]))

  const allOrganizations = await organizations.listOrganizations({})
  const organizationNameOf = new Map(
    allOrganizations.map((organization) => [organization.market_id, organization.name]),
  )

  /**
   * 売買の組は「買った側の行」と「売った側の行」の両方から戻す。
   * 先生の口座と企業の口座の両方を読まないと組にならない。
   */
  const entries = (
    await Promise.all(
      [...adminIds, ...allOrganizations.map((organization) => organization.market_id)].map((id) =>
        mp.listEntriesFor(id),
      ),
    )
  ).flat()

  const trades = buildTrades(entries)
  const sellerName = (marketId: string) => organizationNameOf.get(marketId) ?? null

  const summaries = summarizeAdminPurchases(trades, adminIds)

  res.status(200).json({
    // 先生ごとの購入先・金額・回数（受け入れ基準 H4）。
    administrators: summaries.map((summary) => ({
      admin_id: summary.adminId,
      admin_identifier: adminNameOf.get(summary.adminId) ?? null,
      purchase_count: summary.purchaseCount,
      total_amount: summary.totalAmount,
      concentration_rate: summary.concentrationRate,
      sellers: summary.sellers.map((seller) => ({
        market_id: seller.sellerId,
        organization_name: sellerName(seller.sellerId),
        amount: seller.amount,
        count: seller.count,
      })),
    })),
    // 企業別購入額（要件22）。何人の先生から買われたかも出す。
    sellers: sellersFromAdmins(trades, adminIds).map((seller) => ({
      market_id: seller.sellerId,
      organization_name: sellerName(seller.sellerId),
      amount: seller.amount,
      count: seller.count,
      admin_count: seller.adminCount,
    })),
    totals: {
      administrators: adminIds.length,
      purchase_count: summaries.reduce((sum, summary) => sum + summary.purchaseCount, 0),
      total_amount: summaries.reduce((sum, summary) => sum + summary.totalAmount, 0),
    },
    // 新しい順の明細。「さっき買ったものが出ているか」を確かめるのに使う。
    recent: trades
      .filter((trade) => adminNameOf.has(trade.buyerId))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, RECENT_LIMIT)
      .map((trade) => ({
        admin_id: trade.buyerId,
        admin_identifier: adminNameOf.get(trade.buyerId) ?? null,
        market_id: trade.sellerId,
        organization_name: sellerName(trade.sellerId),
        amount: trade.amount,
        at: trade.at,
      })),
  })
}
