import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { Modules } from '@medusajs/framework/utils'

import { generateRecoveryCode, hashRecoveryCode, ID_ALPHABET } from '../../../../modules/market-id'

/**
 * 管理者が Market ID を指定してパスワードを初期化する（受け入れ基準 A5、要件36）。
 *
 * Recovery Code も無くした生徒のための最後の手段。管理者は
 * 「これは誰のアカウントか」を仕組みに登録しない（要件37）ので、
 * **本人確認は教室で対面で行う前提**。ここは操作を受け付けるだけ。
 *
 * この経路は `/admin` の下にあり、管理者の認証を通らないと呼べない。
 */

/** 一時パスワードの長さ。口頭で伝える前提なので、長すぎると打ち間違える。 */
const TEMPORARY_PASSWORD_LENGTH = 12

/**
 * 一時パスワードを作る。Market ID と同じ文字集合を使う。
 * 紛らわしい 0 O 1 I が入らないので、読み上げても取り違えない。
 */
function generateTemporaryPassword(): string {
  const bytes = new Uint32Array(TEMPORARY_PASSWORD_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => ID_ALPHABET[value % ID_ALPHABET.length]).join('')
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { market_id?: unknown }
  const marketId = typeof body.market_id === 'string' ? body.market_id.trim().toUpperCase() : ''

  if (!marketId) {
    res.status(400).json({ code: 'market_id_required' })
    return
  }

  const authService = req.scope.resolve(Modules.AUTH)
  const [identity] = await authService.listAuthIdentities({
    app_metadata: { market_id: marketId },
  } as never)

  if (!identity) {
    // 管理者向けの画面なので、ここでは「無い」と正直に伝えてよい。
    // 打ち間違いを直せないと、管理者が先へ進めない。
    res.status(404).json({ code: 'market_id_not_found', market_id: marketId })
    return
  }

  const temporaryPassword = generateTemporaryPassword()
  // 初期化のたびに Recovery Code も新しくする。古いコードが誰かの手にある
  // 可能性があるからこそ初期化しているため。
  const recoveryCode = generateRecoveryCode()

  await authService.updateProvider('emailpass', {
    entity_id: marketId,
    password: temporaryPassword,
  } as never)

  await authService.updateAuthIdentities({
    id: identity.id,
    app_metadata: {
      ...(identity.app_metadata as Record<string, unknown>),
      recovery_code_hash: hashRecoveryCode(recoveryCode),
    },
  })

  res.status(200).json({
    market_id: marketId,
    // どちらもこの応答でしか見せない。管理者が本人へ手渡す。
    temporary_password: temporaryPassword,
    recovery_code: recoveryCode,
    shown_once: true,
  })
}
