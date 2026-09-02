import { MedusaService } from '@medusajs/framework/utils'

import { setLoginPolicy } from '../login-guard/guard'
import {
  MARKET_SETTING_KEYS,
  mergeMarketSettings,
  type MarketSettingKey,
  type MarketSettings,
} from './defaults'
import { MarketSetting } from './models/market-setting'

/**
 * 先生が画面から変えられる数字の保存と読み出し
 * （`docs/requirements.md` 第2部の前書き）。
 *
 * **読むたびに、ログインを止める決まりへ反映する。** その判定は
 * `apps/api/src/api/middlewares.ts` の中で同期的に呼ばれるので、
 * 数字を読みに行けない。こちら側から押し込む形にする。
 */
class MarketSettingsService extends MedusaService({ MarketSetting }) {
  /** 保存されている行だけを、名前 → 値の形で読む。 */
  private async storedValues(): Promise<Record<string, unknown>> {
    const rows = await this.listMarketSettings({})
    const stored: Record<string, unknown> = {}
    for (const row of rows) stored[row.key] = row.value
    return stored
  }

  /** いま効いている数字。保存が無いものは既定値。 */
  async read(): Promise<MarketSettings> {
    const settings = mergeMarketSettings(await this.storedValues())
    this.applyLoginPolicy(settings)
    return settings
  }

  /** 保存されている行だけ（画面で「既定値のまま」を見分けるために使う）。 */
  async readStored(): Promise<Partial<MarketSettings>> {
    const stored = await this.storedValues()
    const only: Partial<MarketSettings> = {}
    for (const key of MARKET_SETTING_KEYS) {
      if (typeof stored[key] === 'number') only[key] = stored[key] as number
    }
    return only
  }

  /**
   * 数字を保存する。**検査を通した値だけを渡すこと**（`checkMarketSettings`）。
   *
   * 同じ名前の行があれば書き換え、無ければ足す。名前ごとに1行しか持たない。
   */
  async save(patch: Partial<Record<MarketSettingKey, number>>): Promise<MarketSettings> {
    const rows = await this.listMarketSettings({})
    const byKey = new Map(rows.map((row) => [row.key, row]))

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      const existing = byKey.get(key)
      if (existing) {
        await this.updateMarketSettings({ id: existing.id, value })
      } else {
        await this.createMarketSettings({ key, value })
      }
    }

    return this.read()
  }

  /** すべて既定値に戻す。保存した行を消すだけで、既定値そのものは消えない。 */
  async resetAll(): Promise<MarketSettings> {
    const rows = await this.listMarketSettings({})
    if (rows.length > 0) {
      await this.deleteMarketSettings(rows.map((row) => row.id))
    }
    return this.read()
  }

  /** ログインを止める決まりへ反映する。 */
  private applyLoginPolicy(settings: MarketSettings): void {
    setLoginPolicy({
      maxAttempts: settings.login_max_attempts,
      lockDurationMs: settings.login_lock_minutes * 60_000,
    })
  }
}

export default MarketSettingsService
