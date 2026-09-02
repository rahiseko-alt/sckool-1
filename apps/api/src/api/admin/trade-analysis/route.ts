import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import {
  buildTrades,
  DEFAULT_MUTUAL_THRESHOLD,
  mutualTradeRates,
  purchaseConcentrations,
} from '../../../modules/admin-overview/trade-analysis'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 取引の偏りを先生に見せる（要件20〜22、受け入れ基準 H2・H3）。
 *
 * **仕組みは「不正だ」と判定しない。** 買い合いと、本当に良いと思って買うことは
 * データから区別できない。出すのは数字だけで、判断は先生がする。
 *
 * 画面には企業名を出す。Market ID も添えるのは、気になった企業をそのまま
 * パスワード初期化（受け入れ基準 A5）につなげられるようにするため。
 */

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const requested = Number(req.query.threshold)
  const threshold =
    Number.isFinite(requested) && requested > 0 && requested <= 100
      ? requested
      : DEFAULT_MUTUAL_THRESHOLD

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const mp = req.scope.resolve(MP_MODULE) as MpService

  const all = await organizations.listOrganizations({})
  const nameOf = new Map(all.map((organization) => [organization.market_id, organization.name]))

  /**
   * 履歴は企業ごとに読む。売買の組は買う側と売る側の両方の行から戻すので、
   * 登録されている企業ぶんを全部集めてから組に直す。
   */
  const entries = (
    await Promise.all(all.map((organization) => mp.listEntriesFor(organization.market_id)))
  ).flat()

  const trades = buildTrades(entries)

  /** 企業名を添える。id だけでは先生が誰のことか分からない。 */
  const withName = (marketId: string) => ({
    market_id: marketId,
    organization_name: nameOf.get(marketId) ?? null,
  })

  res.status(200).json({
    threshold,
    trade_count: trades.length,
    mutual_trade: mutualTradeRates(trades, threshold).map((pair) => ({
      a: withName(pair.a),
      b: withName(pair.b),
      between: pair.between,
      total: pair.total,
      rate: pair.rate,
      flagged: pair.flagged,
    })),
    purchase_concentration: purchaseConcentrations(trades).map((row) => ({
      organization: withName(row.organizationId),
      top_seller: withName(row.topSellerId),
      top_amount: row.topAmount,
      total_amount: row.totalAmount,
      rate: row.rate,
      seller_count: row.sellerCount,
    })),
  })
}
