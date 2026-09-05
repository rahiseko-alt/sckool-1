import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import {
  checkMarketSettings,
  MARKET_SETTING_DEFAULTS,
  MARKET_SETTING_RANGES,
  MARKET_SETTINGS_MODULE,
  normalizeMarketSettings,
} from '../../../modules/market-settings'
import type MarketSettingsService from '../../../modules/market-settings/service'

/**
 * 授業ごとに変えられる数字を、先生が画面から読み書きする
 * （`docs/requirements.md` 第2部の前書き）。
 *
 * 対象は4つ。初期資金・ログインを止めるまでの失敗回数・止めておく時間・
 * 相互取引率のしきい値。**得点からボーナスへの換算表はテストごとに持つ**ので
 * ここではなく `/admin/quizzes` にある。
 *
 * この経路は `/admin` の下にあり、管理者の認証を通らないと呼べない。
 *
 * 経路の名前を `settings` にしないのは、土台（Medusa / Mercur）が同じ名前の
 * 経路を持つため。ぶつかると、どちらが動いているか分からなくなる。
 */

const service = (req: MedusaRequest) =>
  req.scope.resolve(MARKET_SETTINGS_MODULE) as MarketSettingsService

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const settings = service(req)

  res.status(200).json({
    // いま効いている数字。保存が無いものは既定値。
    settings: await settings.read(),
    // 既定値も返す。画面が「既定値 100,000」と添えられるようにするため。
    defaults: MARKET_SETTING_DEFAULTS,
    ranges: MARKET_SETTING_RANGES,
    // 保存されているものだけ。画面が「変更済み」を見分けるのに使う。
    stored: await settings.readStored(),
  })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  // 画面は `{ settings: {...} }` で送る。数字だけを直接送っても受け取る。
  const input = (
    body.settings && typeof body.settings === 'object' ? body.settings : body
  ) as Record<string, unknown>

  const problems = checkMarketSettings(input)
  if (problems.length > 0) {
    // 文ではなく符号で返す。画面が6言語で出せるようにするため。
    res.status(400).json({ code: 'invalid_settings', problems })
    return
  }

  const settings = service(req)
  const saved = await settings.save(normalizeMarketSettings(input))

  res.status(200).json({
    settings: saved,
    defaults: MARKET_SETTING_DEFAULTS,
    ranges: MARKET_SETTING_RANGES,
    stored: await settings.readStored(),
  })
}

/** すべて既定値に戻す。保存した行を消すだけで、既定値そのものは消えない。 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const settings = service(req)
  const reset = await settings.resetAll()

  res.status(200).json({
    settings: reset,
    defaults: MARKET_SETTING_DEFAULTS,
    ranges: MARKET_SETTING_RANGES,
    stored: await settings.readStored(),
  })
}
