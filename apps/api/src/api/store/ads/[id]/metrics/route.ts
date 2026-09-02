import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../../../modules/ads'
import type AdsService from '../../../../../modules/ads/service'

/**
 * 広告1枠の効果（要件13、受け入れ基準 F2）。
 *
 * 表示回数・クリック数・CTR・広告経由の購入数・広告費・売上・ROAS を返す。
 * 生徒はこれを見て「広告費を出したら売上がどう変わったか」を判断する。
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const ads = req.scope.resolve(ADS_MODULE) as AdsService
  const [placement] = await ads.listAdPlacements({ id: req.params.id })

  if (!placement) {
    res.status(404).json({ code: 'placement_not_found' })
    return
  }

  res.status(200).json({
    placement_id: req.params.id,
    metrics: await ads.metricsFor(req.params.id),
  })
}
