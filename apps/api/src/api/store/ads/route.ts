import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../modules/ads'
import type AdsService from '../../../modules/ads/service'
import { CATALOG_MODULE } from '../../../modules/catalog'
import { localeOf } from '../../../modules/catalog/locales'
import type CatalogService from '../../../modules/catalog/service'
import { marketIdOf } from '../../../modules/market-auth/token'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * トップページの Featured 枠（要件12、受け入れ基準 F1）。
 *
 * GET  … いま出ている広告を返す。表示した回数もここで数える
 * POST … MP を払って枠を買う
 */

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const ads = req.scope.resolve(ADS_MODULE) as AdsService
  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService

  const placements = await ads.listActive()
  const featured = []

  for (const placement of placements) {
    // 商品名は閲覧者の言語に合わせる。Featured だけ原文のままだと見比べにくい。
    const listing = await catalog.findListing(placement.listing_id, new Date(), localeOf(req))
    if (!listing) continue

    const owner = await organizations.findByMarketId(listing.organization_id)

    // 出したぶんを表示回数として数える（要件13）。
    await ads.record(placement.id, 'impression')

    featured.push({
      placement_id: placement.id,
      listing_id: listing.id,
      title: listing.title,
      price: listing.price,
      image_url: listing.image_url,
      // 出品者は企業名だけ（要件38）。
      organization_name: owner?.name ?? null,
      can_buy: listing.unavailable_reason === undefined,
    })
  }

  res.status(200).json({ featured, count: featured.length })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { listing_id?: unknown; days?: unknown }
  // 広告を出す企業は**合鍵から決める**。本文の market_id は読まない。
  const marketId = marketIdOf(req)
  const listingId = typeof body.listing_id === 'string' ? body.listing_id : ''
  const days = typeof body.days === 'number' ? body.days : Number.NaN

  if (!listingId) {
    res.status(400).json({ code: 'listing_id_required' })
    return
  }

  const ads = req.scope.resolve(ADS_MODULE) as AdsService
  const price = ads.quote(days)
  if (price === undefined) {
    res.status(400).json({ code: 'invalid_days' })
    return
  }

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  if (!(await organizations.findByMarketId(marketId))) {
    res.status(404).json({ code: 'organization_not_found' })
    return
  }

  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const listing = await catalog.findListing(listingId)
  if (!listing) {
    res.status(404).json({ code: 'listing_not_found' })
    return
  }

  // 他社の商品を宣伝させない。広告費は自社の売上のために使うもの。
  if (listing.organization_id !== marketId) {
    res.status(403).json({ code: 'not_your_listing' })
    return
  }

  // 先に払う。払えなければ枠は作らない。
  const mp = req.scope.resolve(MP_MODULE) as MpService
  const paid = await mp.spend({
    organizationId: marketId,
    amount: price,
    kind: 'ad_spend',
    reference: listingId,
  })

  if (!paid) {
    res.status(402).json({ code: 'insufficient_balance', price })
    return
  }

  const placement = await ads.createPlacement({
    organizationId: marketId,
    listingId,
    days,
    spend: price,
  })

  res.status(201).json({
    placement,
    spend: price,
    balance: await mp.getBalance(marketId),
  })
}
