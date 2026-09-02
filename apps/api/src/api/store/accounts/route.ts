import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'

import {
  anonymousEmail,
  generateMarketId,
  generateRecoveryCode,
  hashRecoveryCode,
} from '../../../modules/market-id'
import { MP_MODULE } from '../../../modules/mp'
import type MpService from '../../../modules/mp/service'
import { ORGANIZATION_MODULE } from '../../../modules/organization'
import { checkName } from '../../../modules/organization/name'
import type OrganizationService from '../../../modules/organization/service'

/**
 * 匿名アカウントを1つ作る（受け入れ基準 A1・B1・B2）。
 *
 * 受け取るのはパスワードだけ。**氏名もメールも聞かない**（要件35）。
 * 返すのは Market ID と Recovery Code で、**この応答が唯一の表示機会**。
 * 以後どこからも読み出せない（Recovery Code はハッシュだけを保存する）。
 *
 * 生徒がこの画面以外で個人情報を入れる経路は作らない。列は Medusa の都合で
 * 残っているが、入る値は機械が作ったものだけになる（docs/decisions.md「30.」）。
 */

/** 初期資金の既定値（要件3）。管理者が変えられるようにするのは T015 の続きで行う。 */
const DEFAULT_INITIAL_FUNDS = 100_000

/** パスワードの最低の長さ（受け入れ基準 A6）。 */
const MIN_PASSWORD_LENGTH = 8

/** 企業名の長さ（受け入れ基準 B1）。 */
const MAX_ORGANIZATION_NAME = 40

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { password?: unknown; organization_name?: unknown }
  const password = typeof body.password === 'string' ? body.password : ''
  const organizationName =
    typeof body.organization_name === 'string' ? body.organization_name.trim() : ''

  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      code: 'password_too_short',
      min_length: MIN_PASSWORD_LENGTH,
    })
    return
  }

  // 名前の細かい決まりは organization モジュールが持つ（記号だけ、目に見えない
  // 文字が混ざる、といった判定も含む）。ここで先に見るのは、アカウントを作ってから
  // 企業名で失敗すると、使えないアカウントだけが残ってしまうため。
  const nameProblem = checkName(organizationName)
  if (nameProblem) {
    res.status(400).json({
      code: 'organization_name_invalid',
      problem: nameProblem,
      max_length: MAX_ORGANIZATION_NAME,
    })
    return
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const authService = req.scope.resolve(Modules.AUTH)
  const mp = req.scope.resolve(MP_MODULE) as MpService
  const organizations = req.scope.resolve(ORGANIZATION_MODULE) as OrganizationService

  // 企業名が既に使われていないかを、アカウントを作る前に見る。
  // ここを後回しにすると、認証だけできて企業が無いアカウントが残る。
  if (await organizations.findByNameKeyPublic(organizationName)) {
    res.status(409).json({ code: 'organization_name_taken' })
    return
  }

  /**
   * Market ID は当たりにくいが、絶対に重ならないわけではない。
   * 作れるまで数回やり直す（62回に1回でも重なれば作成が失敗するのは困る）。
   */
  let marketId = ''
  let authIdentityId = ''
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateMarketId()
    const result = await authService.register('emailpass', {
      body: { email: candidate, password },
    } as never)

    if (result.success && result.authIdentity) {
      marketId = candidate
      authIdentityId = result.authIdentity.id
      break
    }
    logger.debug(`Market ID ${candidate} は使えなかったので作り直す`)
  }

  if (!marketId) {
    res.status(503).json({ code: 'market_id_unavailable' })
    return
  }

  // Recovery Code は**この応答でしか見せない**。保存するのはハッシュだけ。
  const recoveryCode = generateRecoveryCode()

  await authService.updateAuthIdentities({
    id: authIdentityId,
    app_metadata: {
      market_id: marketId,
      organization_name: organizationName,
      // 機械が作った値だけを入れる。人が入力する経路は無い。
      anonymous_email: anonymousEmail(marketId),
      recovery_code_hash: hashRecoveryCode(recoveryCode),
    },
  })

  const organization = await organizations.createFor(marketId, organizationName)
  if (!organization.ok) {
    // ここに来るのは、確認したあとに他の人が同じ名前で先に作った場合だけ。
    res.status(409).json({ code: 'organization_name_taken' })
    return
  }

  await mp.grantInitialFunds(marketId, DEFAULT_INITIAL_FUNDS)

  res.status(201).json({
    market_id: marketId,
    // 一度だけの表示であることを、受け取る側にも分かる形で伝える。
    recovery_code: recoveryCode,
    recovery_code_shown_once: true,
    organization_name: organization.organization.name,
    balance: await mp.getBalance(marketId),
  })
}
