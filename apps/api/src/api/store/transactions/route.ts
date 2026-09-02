import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { CATALOG_MODULE } from '../../../modules/catalog'
import type CatalogService from '../../../modules/catalog/service'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 自社の取引履歴（受け入れ基準 D5）。
 *
 * 相手は**企業名だけ**を出す。Market ID は出さない（要件38）。
 * 「誰が動かしている企業か」を市場から辿れないようにするため。
 */

/** 画面に出す言葉。何が起きたかが一目で分かるようにする。 */
const KIND_LABELS: Record<string, string> = {
  initial_grant: '初期資金',
  bonus_grant: 'テストのボーナス',
  bonus_expired: 'ボーナスの失効',
  purchase: '商品の購入',
  sale: '商品の販売',
  ad_spend: '広告費',
  reversal: '取り消し',
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const marketId =
    typeof req.query.market_id === 'string' ? req.query.market_id.trim().toUpperCase() : ''

  if (!marketId) {
    res.status(400).json({ code: 'market_id_required' })
    return
  }

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const organization = await organizations.findByMarketId(marketId)
  if (!organization) {
    res.status(404).json({ code: 'organization_not_found' })
    return
  }

  const mp = req.scope.resolve(MP_MODULE) as MpService
  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService

  const entries = await mp.listEntriesFor(marketId)

  // 相手の企業名を引くために、商品からその出品者をたどる。
  // 1件ずつ引くと履歴の数だけ問い合わせが出るので、まとめて引く。
  const listingIds = [
    ...new Set(
      entries
        .filter((entry) => entry.kind === 'purchase' || entry.kind === 'sale')
        .map((entry) => entry.reference)
        .filter((reference): reference is string => typeof reference === 'string'),
    ),
  ]
  const listings = await Promise.all(listingIds.map((id) => catalog.findListing(id)))
  const listingById = new Map(
    listings.filter((listing) => listing !== undefined).map((listing) => [listing!.id, listing!]),
  )

  const counterpartNames = new Map<string, string>()
  for (const listing of listingById.values()) {
    if (counterpartNames.has(listing.organization_id)) continue
    const owner = await organizations.findByMarketId(listing.organization_id)
    if (owner) counterpartNames.set(listing.organization_id, owner.name)
  }

  const rows = entries
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((entry) => {
      const listing = entry.reference ? listingById.get(entry.reference) : undefined
      /**
       * 相手の企業。買ったときは売り手、売れたときは買い手。
       * 買い手は履歴からは分からないので、売れたときは商品名だけを出す。
       */
      const counterpart =
        entry.kind === 'purchase' && listing
          ? (counterpartNames.get(listing.organization_id) ?? null)
          : null

      return {
        id: entry.id,
        occurred_at: entry.createdAt,
        kind: entry.kind,
        kind_label: KIND_LABELS[entry.kind] ?? entry.kind,
        pocket: entry.pocket,
        amount: entry.amount,
        ...(listing ? { listing_title: listing.title } : {}),
        counterpart_name: counterpart,
      }
    })

  res.status(200).json({
    organization_name: organization.name,
    balance: await mp.getBalance(marketId),
    transactions: rows,
    count: rows.length,
  })
}
