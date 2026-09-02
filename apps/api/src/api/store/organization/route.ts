import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { marketIdOf } from '../../../modules/market-auth/token'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 自社の企業名（受け入れ基準 B1）。
 *
 * **後から変えられる。** 打ち間違えたまま作ってしまった生徒が直せないと、
 * その名前で1つの授業を過ごすことになる。判定役が「変える手段がどこにも無い」
 * ことを見つけたため足した。
 *
 * 変えられるのは**自社の名前だけ**。どの企業かは合鍵から決める
 * （`docs/decisions.md`「37.」）。
 */

/** 名前の問題と、返す状態の対応。画面はこの合図を辞書のキーに直して出す。 */
const STATUS_OF: Record<string, number> = {
  name_taken: 409,
  not_found: 404,
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const organization = await organizations.findByMarketId(marketIdOf(req))

  if (!organization) {
    res.status(404).json({ code: 'organization_not_found' })
    return
  }

  res.status(200).json({
    market_id: organization.market_id,
    organization_name: organization.name,
  })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { organization_name?: unknown }
  const name = typeof body.organization_name === 'string' ? body.organization_name : ''

  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService
  const result = await organizations.rename(marketIdOf(req), name)

  if (!result.ok) {
    // 長さや使える文字の決まりは organization モジュールが持つ。
    // 画面はこの `problem` を辞書のキーにして、その言語で出す。
    res.status(STATUS_OF[result.problem] ?? 400).json({
      code: 'organization_name_invalid',
      problem: result.problem,
    })
    return
  }

  res.status(200).json({
    market_id: result.organization.market_id,
    organization_name: result.organization.name,
  })
}
