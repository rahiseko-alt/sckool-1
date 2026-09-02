import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { CATALOG_MODULE } from '../../../../modules/catalog'
import type CatalogService from '../../../../modules/catalog/service'
import { ORGANIZATION_MODULE } from '../../../../modules/organization'
import type OrganizationService from '../../../../modules/organization/service'

/**
 * 商品1件の詳細（要件7、受け入れ基準 C2）。
 *
 * 買えないときは理由を添える。ただ押せなくするだけでは、
 * 「まだ始まっていない」のか「売り切れた」のかが分からない。
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.id
  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const listing = await catalog.findListing(id)

  if (!listing) {
    res.status(404).json({ code: 'listing_not_found' })
    return
  }

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const organization = await organizations.findByMarketId(listing.organization_id)

  res.status(200).json({
    listing: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      target_customer: listing.target_customer,
      problem_solved: listing.problem_solved,
      price: listing.price,
      available_quantity: listing.available_quantity,
      image_url: listing.image_url,
      sale_starts_at: listing.sale_starts_at,
      sale_ends_at: listing.sale_ends_at,
      // 出品者は企業名だけ。Market ID は返さない（要件38）。
      organization_name: organization?.name ?? null,
      can_buy: listing.unavailable_reason === undefined,
      ...(listing.unavailable_reason ? { unavailable_reason: listing.unavailable_reason } : {}),
    },
  })
}
