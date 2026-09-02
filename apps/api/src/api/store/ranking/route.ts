import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../modules/ads'
import type AdsService from '../../../modules/ads/service'
import { calculateStats } from '../../../modules/dashboard/stats'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * ランキング（要件25、受け入れ基準 G2）。
 *
 * **売上だけにしない。** 売上だけで並べると勝者総取りのゲームになり、
 * 「売れる仕組みを作る」という授業の狙い（要件1）から外れる。
 * 5つの指標で切り替えられるようにして、違う強みが見えるようにする。
 *
 * 表示は**企業名だけ**。Market ID は出さない（要件38）。
 */

/** 並べ替えに使える指標。 */
const METRICS = ['revenue', 'profit', 'profit_margin', 'customers', 'roas'] as const
type Metric = (typeof METRICS)[number]

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const requested = typeof req.query.metric === 'string' ? req.query.metric : 'revenue'
  const metric = (METRICS as readonly string[]).includes(requested)
    ? (requested as Metric)
    : 'revenue'

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const mp = req.scope.resolve(MP_MODULE) as MpService
  const ads = req.scope.resolve(ADS_MODULE) as AdsService

  const all = await organizations.listOrganizations({})

  const rows = await Promise.all(
    all.map(async (organization) => {
      const entries = await mp.listEntriesFor(organization.market_id)
      const stats = calculateStats(entries)
      const adMetrics = await ads.metricsForOrganization(organization.market_id)

      /**
       * 顧客数は「何社に売れたか」。履歴からは買い手が分からないので、
       * 売れた商品の数で近似せず、売れた件数のうち異なる商品の数を数える。
       * ここは T030（取引分析）で買い手まで見えるようになったら差し替える。
       */
      const customers = new Set(
        entries
          .filter((entry) => entry.kind === 'sale' && entry.reference)
          .map((entry) => entry.reference),
      ).size

      return {
        // 企業名だけ。Market ID は返さない（要件38）。
        organization_name: organization.name,
        revenue: stats.revenue,
        profit: stats.profit,
        profit_margin: stats.profit_margin,
        customers,
        roas: adMetrics.roas,
      }
    }),
  )

  rows.sort((a, b) => b[metric] - a[metric])

  res.status(200).json({
    metric,
    available_metrics: METRICS,
    ranking: rows.map((row, index) => ({ rank: index + 1, ...row })),
    count: rows.length,
  })
}
