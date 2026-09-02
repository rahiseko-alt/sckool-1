import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../modules/ads'
import type AdsService from '../../../modules/ads/service'
import { CATALOG_MODULE } from '../../../modules/catalog'
import type CatalogService from '../../../modules/catalog/service'
import { marketIdOf } from '../../../modules/market-auth/token'
import {
  calculateStats,
  dailyRevenue,
  fillMissingDays,
  salesByListing,
} from '../../../modules/dashboard/stats'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 経営ダッシュボード（要件16、受け入れ基準 G1）。
 *
 * **数字はすべて取引履歴から計算する。** 集計値をどこかに保存すると、
 * 履歴と食い違ったときにどちらが正しいか分からなくなる。
 * 受け入れ基準は「履歴から再計算した値と一致すること」なので、
 * ここで再計算しているのが正しい姿。
 */

/** グラフに出す日数。1つの授業期間を見渡せる長さ。 */
const CHART_DAYS = 14

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  // 見せる企業は**合鍵から決める**。他社の経営数字を覗けないようにするため。
  const marketId = marketIdOf(req)

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const organization = await organizations.findByMarketId(marketId)
  if (!organization) {
    res.status(404).json({ code: 'organization_not_found' })
    return
  }

  const mp = req.scope.resolve(MP_MODULE) as MpService
  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const ads = req.scope.resolve(ADS_MODULE) as AdsService

  const entries = await mp.listEntriesFor(marketId)
  const stats = calculateStats(entries)

  // 商品ごとの売上に、商品名を添える。
  const perListing = salesByListing(entries)
  const listings = await catalog.listForOrganization(marketId)
  const listingById = new Map(listings.map((listing) => [listing.id, listing]))
  const productSales = [...perListing.entries()]
    .map(([listingId, revenue]) => ({
      listing_id: listingId,
      title: listingById.get(listingId)?.title ?? null,
      revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const now = new Date()
  const from = new Date(now.getTime() - (CHART_DAYS - 1) * 24 * 60 * 60 * 1000)

  res.status(200).json({
    organization_name: organization.name,
    // 通常とボーナスを分けて出す（受け入れ基準 G1）。
    balance: await mp.getBalance(marketId),
    stats,
    ad_metrics: await ads.metricsForOrganization(marketId),
    product_sales: productSales,
    // 売れなかった日も0で埋める。詰めると右肩上がりに見えてしまう。
    revenue_chart: fillMissingDays(dailyRevenue(entries), from, now),
  })
}
