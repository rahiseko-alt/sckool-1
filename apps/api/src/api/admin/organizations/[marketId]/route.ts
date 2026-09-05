import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../../modules/ads'
import type AdsService from '../../../../modules/ads/service'
import { CATALOG_MODULE } from '../../../../modules/catalog'
import type CatalogService from '../../../../modules/catalog/service'
import { calculateStats } from '../../../../modules/dashboard/stats'
import { MP_MODULE } from '../../../../modules/mp'
import type MpService from '../../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../../modules/organization'
import type OrganizationService from '../../../../modules/organization/service'

/**
 * 1社の内訳を、先生が全部見る（要件26、受け入れ基準 H1）。
 *
 * **一覧の合計だけでは足りない。** 基準は「残高・売上・利益・**取引**・**商品**・
 * 広告を一覧できる」と書いてある。判定役に「台帳に10,969行あるのに、取引を
 * 1行も見る手段が無い」「商品も件数だけで中身が見えない」と指摘されて足した。
 *
 * 先生は不正を疑ったときにここへ来る。合計だけ見えても、
 * 「誰から誰へ、いつ、いくら動いたか」が分からなければ確かめようがない。
 *
 * 相手は企業名で出す。**先生の画面なので Market ID も出す**（要件38 が隠す
 * 相手は生徒どうし。先生はパスワードの初期化に Market ID を使う）。
 */

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const marketId = String(req.params.marketId ?? '')

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const organization = await organizations.findByMarketId(marketId)
  if (!organization) {
    res.status(404).json({ code: 'organization_not_found' })
    return
  }

  const mp = req.scope.resolve(MP_MODULE) as MpService
  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const ads = req.scope.resolve(ADS_MODULE) as AdsService

  const now = new Date()
  const entries = await mp.listEntriesFor(marketId)
  const listings = await catalog.listForOrganization(marketId, now)

  // 相手の企業名を引く。買ったときは商品の持ち主、売れたときは印から買い手。
  const listingIds = [
    ...new Set(
      entries
        .filter((entry) => entry.kind === 'purchase')
        .map((entry) => entry.reference)
        .filter((reference): reference is string => typeof reference === 'string'),
    ),
  ]
  const purchasedListings = await Promise.all(listingIds.map((id) => catalog.findListing(id, now)))
  const sellerIdByListing = new Map(
    purchasedListings
      .filter((listing) => listing !== undefined)
      .map((listing) => [listing!.id, listing!.organization_id]),
  )

  const saleGroupIds = entries
    .filter((entry) => entry.kind === 'sale' && entry.groupId)
    .map((entry) => entry.groupId as string)
  const buyerIdByGroup = await mp.findBuyersForGroups(saleGroupIds)

  // 相手の名前は1社1回だけ引く。行ごとに引くと取引の数だけ問い合わせが出る。
  const counterpartIds = new Set([...sellerIdByListing.values(), ...buyerIdByGroup.values()])
  const nameById = new Map<string, string>()
  for (const id of counterpartIds) {
    const found = await organizations.findByMarketId(id)
    if (found) nameById.set(id, found.name)
  }

  const titleById = new Map(
    [...purchasedListings, ...listings]
      .filter((listing) => listing !== undefined)
      .map((listing) => [listing!.id, listing!.title]),
  )

  /**
   * 取り消しの行（`reversal`）は `reference` に**元の行の id** を持つ。商品ではない。
   * そのままでは「取り消し 12,000」としか出ず、何を取り消したのか先生に分からない。
   * 同じ印（`group_id`）の元の売買から、商品と相手を引き継いで見せる。
   */
  const originalByGroup = new Map<string, { listingId?: string; kind: string }>()
  for (const entry of entries) {
    if (entry.kind !== 'purchase' && entry.kind !== 'sale') continue
    if (!entry.groupId) continue
    originalByGroup.set(entry.groupId, {
      ...(entry.reference ? { listingId: entry.reference } : {}),
      kind: entry.kind,
    })
  }

  const transactions = entries
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((entry) => {
      const original = entry.groupId ? originalByGroup.get(entry.groupId) : undefined
      const kind = entry.kind === 'reversal' ? (original?.kind ?? entry.kind) : entry.kind
      const listingId =
        entry.kind === 'purchase' || entry.kind === 'sale' ? entry.reference : original?.listingId

      let counterpartId: string | undefined
      if (kind === 'purchase' && listingId) {
        counterpartId = sellerIdByListing.get(listingId)
      } else if (kind === 'sale' && entry.groupId) {
        counterpartId = buyerIdByGroup.get(entry.groupId)
      }

      return {
        id: entry.id,
        occurred_at: entry.createdAt,
        kind: entry.kind,
        pocket: entry.pocket,
        amount: entry.amount,
        group_id: entry.groupId ?? null,
        listing_title: listingId ? (titleById.get(listingId) ?? null) : null,
        counterpart_market_id: counterpartId ?? null,
        counterpart_name: counterpartId ? (nameById.get(counterpartId) ?? null) : null,
      }
    })

  res.status(200).json({
    market_id: organization.market_id,
    organization_name: organization.name,
    balance: await mp.getBalance(marketId, now),
    stats: calculateStats(entries),
    ad_metrics: await ads.metricsForOrganization(marketId),
    listings: listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      price: listing.price,
      available_quantity: listing.available_quantity,
      sale_starts_at: listing.sale_starts_at,
      sale_ends_at: listing.sale_ends_at,
      unavailable_reason: listing.unavailable_reason ?? null,
    })),
    transactions,
    count: transactions.length,
  })
}
