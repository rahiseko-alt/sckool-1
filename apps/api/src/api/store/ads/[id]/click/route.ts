import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { ADS_MODULE } from '../../../../../modules/ads'
import type AdsService from '../../../../../modules/ads/service'

/**
 * 広告が押されたことを記録する（要件13、受け入れ基準 F2）。
 *
 * 画面は、この経路を呼んでから商品の詳細へ進む。
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const ads = req.scope.resolve(ADS_MODULE) as AdsService
  const [placement] = await ads.listAdPlacements({ id: req.params.id })

  if (!placement) {
    res.status(404).json({ code: 'placement_not_found' })
    return
  }

  await ads.record(req.params.id, 'click')
  res.status(204).send()
}
