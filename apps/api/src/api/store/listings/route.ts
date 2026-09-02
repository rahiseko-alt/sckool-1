import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { CATALOG_MODULE } from '../../../modules/catalog'
import type CatalogService from '../../../modules/catalog/service'
import { marketIdOf } from '../../../modules/market-auth/token'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 市場に並ぶ商品（受け入れ基準 C1・C2）。
 *
 * GET  … 全企業の商品を並べる。買えないものも並べ、理由を添える（要件7）
 * POST … 商品を1件登録する（要件6）
 *
 * 表示するのは**企業名だけ**で、Market ID は出さない（要件38）。
 * 「○○君の商品だから買う」を弱めるための作り。
 */

/** 企業名を引くための対応表を1回で作る。1件ずつ引くと商品の数だけ問い合わせが出る。 */
async function organizationNames(
  organizations: OrganizationService,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  const rows = await Promise.all(unique.map((id) => organizations.findByMarketId(id)))
  return new Map(
    rows.filter((row) => row !== undefined).map((row) => [row!.market_id, row!.name]),
  )
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService

  const listings = await catalog.listMarket()
  const names = await organizationNames(
    organizations,
    listings.map((listing) => listing.organization_id),
  )

  res.status(200).json({
    listings: listings.map((listing) => ({
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
      // 出品者は企業名だけ。Market ID は返さない。
      organization_name: names.get(listing.organization_id) ?? null,
      can_buy: listing.unavailable_reason === undefined,
      ...(listing.unavailable_reason ? { unavailable_reason: listing.unavailable_reason } : {}),
    })),
    count: listings.length,
  })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  // 出品する企業は**合鍵から決める**。本文の market_id は読まない。
  const marketId = marketIdOf(req)

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const organization = await organizations.findByMarketId(marketId)
  if (!organization) {
    res.status(404).json({ code: 'organization_not_found' })
    return
  }

  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const result = await catalog.createListing(marketId, body)

  if (!result.ok) {
    // 問題は全部まとめて返す。1つずつ返すと、直しては断られるのを繰り返す。
    res.status(400).json({ code: 'invalid_listing', problems: result.problems })
    return
  }

  res.status(201).json({
    listing: {
      ...result.listing,
      organization_name: organization.name,
      can_buy: result.listing.unavailable_reason === undefined,
    },
  })
}
