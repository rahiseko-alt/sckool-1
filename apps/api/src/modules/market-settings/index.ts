import { Module } from '@medusajs/framework/utils'
import type { LoaderOptions } from '@medusajs/framework/types'

import { setLoginPolicy } from '../login-guard/guard'
import { mergeMarketSettings } from './defaults'
import MarketSettingsService from './service'

/**
 * 授業ごとに変えられる数字（初期資金・ログインを止める決まり・相互取引率のしきい値）。
 *
 * 既定値は `defaults.ts` がコードとして持ち、保存された値があればそれを使う。
 * **この表が空でも仕組みは動く。**
 */
export const MARKET_SETTINGS_MODULE = 'market_settings'

/**
 * 起動したときに1回だけ、保存された値をログインの決まりへ反映する。
 *
 * **これが無いと、サーバーを立て直すたびに既定値へ戻る。** ログインを止める判定は
 * `apps/api/src/api/middlewares.ts` の中で同期的に動くので、そこから数字を
 * 読みに行けない。こちら側から押し込む形にする。
 *
 * **ここでは自分のサービスを呼べない。** 起動時の入れ物に入っているのは
 * 模型ごとの小さなサービス（`marketSettingService`）だけで、`service.ts` の
 * `read()` は登録されていない（実測）。なので表を直接読む。
 *
 * 表がまだ無い（マイグレーション前）ときは何もしない。ここで落とすと
 * `db:migrate` そのものが実行できなくなる。
 */
const applySavedLoginPolicy = async ({ container, logger }: LoaderOptions): Promise<void> => {
  try {
    const connection = container.resolve('__pg_connection__') as (table: string) => {
      whereNull: (column: string) => {
        select: (...columns: string[]) => Promise<{ key: string; value: unknown }[]>
      }
    }

    /**
     * 「すべて既定値に戻す」は行を消す代わりに `deleted_at` を入れる。
     * ここで除かないと、戻したはずの値がまた効いてしまう。
     */
    const rows = await connection('market_setting').whereNull('deleted_at').select('key', 'value')
    const stored: Record<string, unknown> = {}
    for (const row of rows) stored[row.key] = row.value

    const settings = mergeMarketSettings(stored)
    setLoginPolicy({
      maxAttempts: settings.login_max_attempts,
      lockDurationMs: settings.login_lock_minutes * 60_000,
    })
  } catch (error) {
    logger?.warn(
      '保存された設定を読めなかったので、ログインを止める決まりは既定値のまま始めます: ' +
        String((error as Error)?.message ?? error),
    )
  }
}

export default Module(MARKET_SETTINGS_MODULE, {
  service: MarketSettingsService,
  loaders: [applySavedLoginPolicy],
})

export { MarketSettingsService }
export * from './defaults'
