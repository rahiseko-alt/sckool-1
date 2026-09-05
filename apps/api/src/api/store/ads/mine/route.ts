import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../../modules/ads'
import type AdsService from '../../../../modules/ads/service'
import { CATALOG_MODULE } from '../../../../modules/catalog'
import type CatalogService from '../../../../modules/catalog/service'
import { marketIdOf } from '../../../../modules/market-auth/token'

/**
 * 自社が出した広告の一覧と、それぞれの効果（要件13、受け入れ基準 F2）。
 *
 * **自社の枠しか返さない。** 他社の広告の効き具合が分かると、良い出し方を
 * そのまま真似できてしまい、自分で考える意味が薄くなる。
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const marketId = marketIdOf(req)
  const ads = req.scope.resolve(ADS_MODULE) as AdsService
  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService

  const placements = await ads.listForOrganization(marketId)

  const rows = await Promise.all(
    placements.map(async (placement) => {
      const listing = await catalog.findListing(placement.listing_id)
      return {
        ...placement,
        // どの商品の広告かが分からないと、数字を見ても何も判断できない。
        listing_title: listing?.title ?? null,
        metrics: await ads.metricsFor(placement.id),
      }
    }),
  )

  // 新しいものから並べる。授業中は「いま出している広告」を見たい。
  rows.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())

  res.status(200).json({ placements: rows, count: rows.length })
}
