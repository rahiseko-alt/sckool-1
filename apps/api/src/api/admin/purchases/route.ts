import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../modules/ads'
import type AdsService from '../../../modules/ads/service'
import { CATALOG_MODULE } from '../../../modules/catalog'
import type CatalogService from '../../../modules/catalog/service'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 先生が商品を買う（要件10、受け入れ基準 H4 の前提）。
 *
 * 先生は「買うだけの参加者」として、市場に**外からの需要**を持ち込む。
 * 生徒どうしで MP を回すだけだと市場全体の額が増えないので、
 * 「売れる仕組みを作った企業が伸びる」という手応えが薄くなる。
 *
 * **先生も MP 口座を持ち、生徒と同じ台帳を使う。** 別の帳簿を作ると、
 * 「その MP はどこから来たのか」を後から追えなくなる。口座の id には
 * 先生の利用者 id をそのまま使う（企業ではないので Market ID を持たない）。
 *
 * 予算を定期的に配る仕組み（要件11）は MVP に入れない。ここでは口座を
 * 初めて使うときに既定額を1回だけ配る。
 */

/** 先生に配る MP の既定値。企業の初期資金より少ないのは、買う専門だから。 */
const DEFAULT_ADMIN_BUDGET = 50_000

/**
 * 先生の口座を用意する。すでに履歴があれば何もしない。
 *
 * **配布は履歴に1行として残す。** 残さないと市場全体の MP が合わなくなる。
 */
async function ensureBudget(mp: MpService, adminId: string): Promise<void> {
  const entries = await mp.listEntriesFor(adminId)
  if (entries.length > 0) return
  await mp.grantInitialFunds(adminId, DEFAULT_ADMIN_BUDGET)
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const adminId = req.auth_context?.actor_id
  if (!adminId) {
    res.status(401).json({ code: 'unauthorized' })
    return
  }

  const body = (req.body ?? {}) as { listing_id?: unknown }
  const listingId = typeof body.listing_id === 'string' ? body.listing_id : ''
  if (!listingId) {
    res.status(400).json({ code: 'listing_id_required' })
    return
  }

  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const listing = await catalog.findListing(listingId)
  if (!listing) {
    res.status(404).json({ code: 'listing_not_found' })
    return
  }

  if (listing.unavailable_reason) {
    res.status(409).json({ code: 'listing_unavailable', reason: listing.unavailable_reason })
    return
  }

  const mp = req.scope.resolve(MP_MODULE) as MpService
  await ensureBudget(mp, adminId)

  // 生徒の購入と同じ順番。先に在庫を押さえ、MP の移動に失敗したら戻す。
  const reserved = await catalog.decreaseQuantity(listing.id, 1)
  if (!reserved) {
    res.status(409).json({ code: 'listing_unavailable', reason: 'sold_out' })
    return
  }

  const moved = await mp.transfer({
    buyerId: adminId,
    sellerId: listing.organization_id,
    amount: listing.price,
    reference: listing.id,
  })

  if (!moved) {
    await catalog.increaseQuantity(listing.id, 1)
    res.status(402).json({ code: 'insufficient_balance', price: listing.price })
    return
  }

  const ads = req.scope.resolve(ADS_MODULE) as AdsService
  const placement = await ads.findActiveForListing(listing.id)
  if (placement) {
    await ads.record(placement.id, 'conversion', listing.price)
  }

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const seller = await organizations.findByMarketId(listing.organization_id)

  res.status(201).json({
    listing_id: listing.id,
    title: listing.title,
    price: listing.price,
    seller_name: seller?.name ?? null,
    balance: await mp.getBalance(adminId),
  })
}
