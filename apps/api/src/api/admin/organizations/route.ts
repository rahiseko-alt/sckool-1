import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import {
  buildOverviewRow,
  checkSupply,
  isSortKey,
  overviewTotals,
  sortOverview,
  SORT_KEYS,
} from '../../../modules/admin-overview/overview'
import { ADS_MODULE } from '../../../modules/ads'
import type AdsService from '../../../modules/ads/service'
import { CATALOG_MODULE } from '../../../modules/catalog'
import type CatalogService from '../../../modules/catalog/service'
import { MP_MODULE } from '../../../modules/mp'
import { findExpiredBonuses } from '../../../modules/mp/ledger'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 管理者が全企業を1画面で見る（要件26、受け入れ基準 H1）。
 *
 * **この経路は `/admin` の下にある。** Medusa の標準で管理者の認証を通らないと
 * 呼べないため、生徒のアカウントでは開けない。別に自前の判定を足すと、
 * 判定が2箇所に散って片方だけ直され、抜け道になる。
 *
 * 数字は企業ダッシュボード（受け入れ基準 G1）と同じ関数で数える。
 * 先生の画面と生徒の画面で違う数字が出ると、どちらが正しいか誰にも確かめられない。
 */

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const requestedSort = req.query.sort
  const sort = isSortKey(requestedSort) ? requestedSort : 'revenue'

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const mp = req.scope.resolve(MP_MODULE) as MpService
  const catalog = req.scope.resolve(CATALOG_MODULE) as CatalogService
  const ads = req.scope.resolve(ADS_MODULE) as AdsService

  const all = await organizations.listOrganizations({})
  const now = new Date()

  // 履歴の合計と、期限切れのまま失効の行が無いボーナス。勘定合わせに使う。
  let ledgerTotal = 0
  let unsweptExpiredBonus = 0

  const rows = await Promise.all(
    all.map(async (organization) => {
      const marketId = organization.market_id
      const [entries, listings] = await Promise.all([
        mp.listEntriesFor(marketId),
        catalog.listForOrganization(marketId, now),
      ])

      ledgerTotal += entries.reduce((sum, entry) => sum + entry.amount, 0)
      unsweptExpiredBonus += findExpiredBonuses(entries, now).reduce(
        (sum, expired) => sum + expired.amount,
        0,
      )

      const row = buildOverviewRow({
        marketId,
        organizationName: organization.name,
        entries,
        listingCount: listings.length,
        now,
      })

      // 広告の内訳（表示・クリック・ROAS）は企業ごとの詳細。一覧には広告費だけ出し、
      // 詳しい数字は取り出せる形で添える。
      return { ...row, ad_metrics: await ads.metricsForOrganization(marketId) }
    }),
  )

  const supply = await mp.getSupply()
  const totals = overviewTotals(rows)

  res.status(200).json({
    sort,
    available_sorts: SORT_KEYS,
    organizations: sortOverview(rows, sort),
    totals,
    /**
     * MP の勘定。`matches` が false なら、どこかで片側だけの行を書いている
     * （受け入れ基準 B3）。管理者がその場で気づけるように画面に出す。
     */
    supply: {
      ...supply,
      ...checkSupply({
        balancesTotal: totals.balance_total,
        ledgerTotal,
        unsweptExpiredBonus,
        marketCirculating: supply.circulating,
      }),
    },
  })
}
