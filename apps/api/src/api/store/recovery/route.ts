import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { Modules } from '@medusajs/framework/utils'

import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeCode,
  verifyRecoveryCode,
} from '../../../modules/market-id'

/**
 * Recovery Code で新しいパスワードを設定する（受け入れ基準 A4、要件36）。
 *
 * メールアドレスを持たないので「パスワードを忘れました → メールを送る」が使えない。
 * 代わりに、アカウントを作ったときに1回だけ見せた Recovery Code を使う。
 *
 * **使ったコードは二度と使えない。** 紙に書いて持ち歩く前提なので、
 * 拾われたコードで何度でもパスワードを変えられると困る。
 * 使い切りにして、その場で新しいコードを1回だけ見せる。
 */

const MIN_PASSWORD_LENGTH = 8

/** 失敗したときに返すもの。ID とコードのどちらが違うかを区別しない。 */
const FAILURE_BODY = { code: 'invalid_recovery' } as const

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    market_id?: unknown
    recovery_code?: unknown
    new_password?: unknown
  }

  const marketId = typeof body.market_id === 'string' ? body.market_id.trim().toUpperCase() : ''
  const recoveryCode = typeof body.recovery_code === 'string' ? body.recovery_code : ''
  const newPassword = typeof body.new_password === 'string' ? body.new_password : ''

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ code: 'password_too_short', min_length: MIN_PASSWORD_LENGTH })
    return
  }

  if (!marketId || !recoveryCode) {
    res.status(401).json(FAILURE_BODY)
    return
  }

  const authService = req.scope.resolve(Modules.AUTH)
  const [identity] = await authService.listAuthIdentities({
    // app_metadata に入れた Market ID で引く。
    app_metadata: { market_id: marketId },
  } as never)

  if (!identity) {
    res.status(401).json(FAILURE_BODY)
    return
  }

  const storedHash = (identity.app_metadata as Record<string, unknown> | undefined)
    ?.recovery_code_hash

  if (typeof storedHash !== 'string' || !verifyRecoveryCode(normalizeCode(recoveryCode), storedHash)) {
    res.status(401).json(FAILURE_BODY)
    return
  }

  // 新しいコードを先に作る。パスワードを変えたあとにここで失敗すると、
  // 古いコードが使えないままアカウントが宙に浮く。
  const nextRecoveryCode = generateRecoveryCode()

  await authService.updateProvider('emailpass', {
    entity_id: marketId,
    password: newPassword,
  } as never)

  await authService.updateAuthIdentities({
    id: identity.id,
    app_metadata: {
      ...(identity.app_metadata as Record<string, unknown>),
      recovery_code_hash: hashRecoveryCode(nextRecoveryCode),
    },
  })

  res.status(200).json({
    market_id: marketId,
    // ここでも1回だけ。次に忘れたときのために書き写してもらう。
    recovery_code: nextRecoveryCode,
    recovery_code_shown_once: true,
  })
}
