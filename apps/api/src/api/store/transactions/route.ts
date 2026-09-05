import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { CATALOG_MODULE } from '../../../modules/catalog'
import { localeOf } from '../../../modules/catalog/locales'
import type CatalogService from '../../../modules/catalog/service'
import { marketIdOf } from '../../../modules/market-auth/token'
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

/**
 * **画面に出す言葉はここで作らない。** 取引の種類は `kind` として返し、
 * 訳は画面側の辞書（`transaction.kind.*`）が持つ。ここで日本語を作ると、
 * ほかの言語を選んでいる生徒の画面にその行だけ日本語が出る（受け入れ基準 I2）。
 */

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  // 見せる企業は**合鍵から決める**。他社の取引履歴を覗けないようにするため。
  const marketId = marketIdOf(req)

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
  /**
   * 商品名は**閲覧者の言語で**引く（受け入れ基準 I3）。
   *
   * 訳が無ければ原文が返る。ここで言語を渡し忘れると、市場一覧は英語なのに
   * 取引履歴だけ日本語の商品名、という画面になる（実際にそうなっていた）。
   */
  const locale = localeOf(req)
  const now = new Date()
  const listings = await Promise.all(listingIds.map((id) => catalog.findListing(id, now, locale)))
  const listingById = new Map(
    listings.filter((listing) => listing !== undefined).map((listing) => [listing!.id, listing!]),
  )

  const counterpartNames = new Map<string, string>()
  for (const listing of listingById.values()) {
    if (counterpartNames.has(listing.organization_id)) continue
    const owner = await organizations.findByMarketId(listing.organization_id)
    if (owner) counterpartNames.set(listing.organization_id, owner.name)
  }

  /**
   * 売れたときの相手（買った企業）を引く。
   *
   * 1回の売買は、買う側の行と売る側の行に**同じ印**（`group_id`）が入っている。
   * その印で市場全体の履歴を引き直せば、買った企業が分かる。
   * 印が無い古い行では分からないので、そのときは空のままにする。
   *
   * **出すのは企業名だけ**（要件38）。Market ID は返さない。
   */
  const saleGroupIds = entries
    .filter((entry) => entry.kind === 'sale' && entry.groupId)
    .map((entry) => entry.groupId!)

  const buyerNameByGroup = new Map<string, string>()
  if (saleGroupIds.length > 0) {
    const buyerIds = await mp.findBuyersForGroups(saleGroupIds)
    for (const [groupId, buyerId] of buyerIds) {
      const buyer = await organizations.findByMarketId(buyerId)
      if (buyer) buyerNameByGroup.set(groupId, buyer.name)
    }
  }

  const rows = entries
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((entry) => {
      const listing = entry.reference ? listingById.get(entry.reference) : undefined
      /** 相手の企業。買ったときは売り手、売れたときは買い手。 */
      let counterpart: string | null = null
      if (entry.kind === 'purchase' && listing) {
        counterpart = counterpartNames.get(listing.organization_id) ?? null
      } else if (entry.kind === 'sale' && entry.groupId) {
        counterpart = buyerNameByGroup.get(entry.groupId) ?? null
      }

      return {
        id: entry.id,
        occurred_at: entry.createdAt,
        kind: entry.kind,
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
