import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../../../modules/ads'
import type AdsService from '../../../../../modules/ads/service'
import { marketIdOf } from '../../../../../modules/market-auth/token'

/**
 * 広告1枠の効果（要件13、受け入れ基準 F2）。
 *
 * 表示回数・クリック数・CTR・広告経由の購入数・広告費・売上・ROAS を返す。
 * 生徒はこれを見て「広告費を出したら売上がどう変わったか」を判断する。
 *
 * **自社の枠しか見られない。** 他社の広告の効き具合が分かると、
 * 良い出し方をそのまま真似できてしまい、自分で考える意味が薄くなる。
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const ads = req.scope.resolve(ADS_MODULE) as AdsService
  const [placement] = await ads.listAdPlacements({ id: req.params.id })

  if (!placement) {
    res.status(404).json({ code: 'placement_not_found' })
    return
  }

  if (placement.organization_id !== marketIdOf(req)) {
    // 「無い」ではなく「あなたのものではない」と伝える。存在の有無は
    // どちらにせよ id を知っている相手にしか分からない。
    res.status(403).json({ code: 'not_your_placement' })
    return
  }

  res.status(200).json({
    placement_id: req.params.id,
    metrics: await ads.metricsFor(req.params.id),
  })
}
