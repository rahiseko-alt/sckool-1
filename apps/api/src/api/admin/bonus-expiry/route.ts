import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'

/**
 * 期限が切れたボーナスを、いますぐ失効させる（受け入れ基準 E2）。
 *
 * ふだんは定期実行（`src/jobs/expire-bonuses.ts`）が同じ処理を1時間ごとに行う。
 * ここを別に用意したのは2つの理由から。
 *
 *   - 授業の途中で先生が「いま揃えたい」ときに、次の実行を待たなくて済む
 *   - 検査（`scripts/check-bonus-expiry.mjs`）が、1時間待たずに結果を確かめられる
 *
 * **処理の中身は定期実行と同じ `expireAllBonuses` を呼ぶ。** 別々に書くと、
 * 片方だけ直したときに「手で押せば直るが放っておくと直らない」状態になる。
 *
 * この経路は `/admin` の下にあるので、生徒からは開けない。
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const mp = req.scope.resolve(MP_MODULE) as MpService
  const result = await mp.expireAllBonuses()

  res.json({
    organizations: result.organizations,
    entries: result.entries,
  })
}
