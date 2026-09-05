import type { MedusaContainer } from '@medusajs/framework/types'

import { MP_MODULE } from '../modules/mp'
import type MpService from '../modules/mp/service'

/**
 * 期限が切れたボーナスに「失効」の行を入れる定期実行（受け入れ基準 E2・B3）。
 *
 * **これが無いと、失効の行は誰も作らない。** 期限切れのボーナスは残高から外れるのに
 * 履歴には配布の行が残るので、「残高＝取引履歴の合計」が崩れる
 * （実際に 履歴101,500／残高100,000 になった）。
 *
 * 1時間ごとに回す。ボーナスの期限は7日なので、1時間の遅れは生徒には見えない。
 * 分刻みで回すと、テストを受けていない時間帯にも毎分データベースを触ることになる。
 */
export default async function expireBonusesJob(container: MedusaContainer): Promise<void> {
  const mp = container.resolve(MP_MODULE) as MpService
  const result = await mp.expireAllBonuses()

  // 何もしなかった回もログに残す。「動いていない」と「動いたが対象が無かった」は
  // 見分けが付かないと、止まっていることに気づけない。
  const logger = container.resolve('logger') as { info: (message: string) => void }
  logger.info(
    `[expire-bonuses] 期限切れのボーナスを失効させた: ${result.organizations}社 / ${result.entries}件`,
  )
}

export const config = {
  name: 'expire-bonuses',
  /**
   * 既定は毎時0分。検査のときだけ `MP_BONUS_EXPIRY_CRON` で短くする
   * （`scripts/check-bonus-expiry.mjs` が「本当に自動で動くか」を確かめるため）。
   */
  schedule: process.env.MP_BONUS_EXPIRY_CRON || '0 * * * *',
}
