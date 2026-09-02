import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../modules/ads'
import type AdsService from '../../../modules/ads/service'
import { CATALOG_MODULE } from '../../../modules/catalog'
import { marketIdOf } from '../../../modules/market-auth/token'
import type CatalogService from '../../../modules/catalog/service'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 商品を買う（受け入れ基準 D1〜D5）。
 *
 * ここが仕組みの心臓部。守ること:
 *
 *   1. 自社商品は買えない（要件8）
 *   2. 残高が足りなければ買えない
 *   3. 売り切れ・販売期間外は買えない
 *   4. 在庫を1減らし、MP を買う側から売る側へ移す。**片方だけ起きてはいけない**
 *
 * **順番が大事**。先に在庫を減らし、MP の移動に失敗したら在庫を戻す。
 * 逆にすると、MP を払ったのに在庫が無くて買えない状態が起きる。
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { listing_id?: unknown }
  const listingId = typeof body.listing_id === 'string' ? body.listing_id : ''

  // 買う側は**合鍵から決める**。本文に入れられた market_id は読まない。
  const marketId = marketIdOf(req)

  if (!listingId) {
    res.status(400).json({ code: 'listing_id_required' })
    return
  }

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const buyer = await organizations.findByMarketId(marketId)
  if (!buyer) {
    res.status(404).json({ code: 'organization_not_found' })
    return
  }

  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const listing = await catalog.findListing(listingId)
  if (!listing) {
    res.status(404).json({ code: 'listing_not_found' })
    return
  }

  // 1. 自社商品は買えない（要件8）。
  //    自分で買って売上を作れると、市場の数字が全て意味を失う。
  if (listing.organization_id === marketId) {
    res.status(400).json({ code: 'cannot_buy_own_listing' })
    return
  }

  // 2. 買える状態か（受け入れ基準 C2・D4）。
  if (listing.unavailable_reason) {
    res.status(409).json({ code: 'listing_unavailable', reason: listing.unavailable_reason })
    return
  }

  const mp = req.scope.resolve(MP_MODULE) as MpService

  // 3. 先に在庫を押さえる。MP の移動に失敗したら戻す。
  //    逆順にすると、払ったのに在庫が無い状態が起きる。
  const reserved = await catalog.decreaseQuantity(listing.id, 1)
  if (!reserved) {
    res.status(409).json({ code: 'listing_unavailable', reason: 'sold_out' })
    return
  }

  const moved = await mp.transfer({
    buyerId: marketId,
    sellerId: listing.organization_id,
    amount: listing.price,
    reference: listing.id,
  })

  if (!moved) {
    // 押さえた在庫を戻す。ここを忘れると、買えなかった商品が減り続ける。
    await catalog.increaseQuantity(listing.id, 1)
    res.status(402).json({ code: 'insufficient_balance', price: listing.price })
    return
  }

  // 広告が出ている商品の購入は、広告経由として数える（要件13）。
  // 厳密には「押してから買ったか」を見るべきだが、MVP ではここまでにする。
  // 割り切りの記録は docs/decisions.md「34.」。
  const ads = req.scope.resolve(ADS_MODULE) as AdsService
  const placement = await ads.findActiveForListing(listing.id)
  if (placement) {
    await ads.record(placement.id, 'conversion', listing.price)
  }

  const seller = await organizations.findByMarketId(listing.organization_id)

  res.status(201).json({
    listing_id: listing.id,
    title: listing.title,
    price: listing.price,
    // 相手は企業名だけ（要件38）。
    seller_name: seller?.name ?? null,
    balance: await mp.getBalance(marketId),
  })
}
