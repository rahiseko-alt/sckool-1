import { defineMiddlewares } from '@medusajs/medusa'
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import {
  checkLock,
  recordFailure,
  recordSuccess,
  remainingMinutes,
  type AttemptRecord,
} from '../modules/login-guard/guard'

/**
 * ログインの失敗が続いたときに一時的に止める（受け入れ基準 A6）。
 *
 * **認証の経路そのものに掛ける。** 別に「ログイン用の経路」を作って
 * そこだけで数えても、標準の `/auth/customer/emailpass` が開いたままなら
 * そちらを叩けば素通りできる。止める場所は、実際に合否を判定する場所でなければ
 * 意味がない。
 *
 * この仕組みは Market ID とパスワードだけでログインする（メールも電話も無い）ので、
 * 総当たりを止める手段がここしかない。
 */

/**
 * 失敗の回数を覚えておく場所。
 *
 * いまはプロセスの中だけに持つ。サーバー1台で動かす前提のため。
 * **複数台にするときは Redis に移すこと。** 台ごとに数えると台数ぶん試行できて、
 * 止める意味がなくなる。
 */
const attempts = new Map<string, AttemptRecord>()

/** 覚えておく Market ID の上限。総当たりで無数の ID を試されても増え続けないように。 */
const MAX_TRACKED = 10_000

function identifierOf(req: MedusaRequest): string {
  const body = (req.body ?? {}) as { email?: unknown }
  return typeof body.email === 'string' ? body.email.trim().toUpperCase() : ''
}

const loginGuard = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const identifier = identifierOf(req)
  if (!identifier) {
    next()
    return
  }

  const now = Date.now()
  const lock = checkLock(attempts.get(identifier), now)
  if (lock.locked) {
    res.status(429).json({
      code: 'too_many_attempts',
      retry_after_minutes: remainingMinutes(lock.remainingMs),
    })
    return
  }

  // 応答が決まってから、成功か失敗かで数え方を変える。
  res.on('finish', () => {
    // 認証が通ったかどうかは状態で見る。200 以外は全て失敗として数える。
    if (res.statusCode >= 200 && res.statusCode < 300) {
      attempts.set(identifier, recordSuccess())
      return
    }
    if (attempts.size >= MAX_TRACKED && !attempts.has(identifier)) {
      // 一番古いものから捨てる。Map は入れた順を保つ。
      const oldest = attempts.keys().next().value
      if (oldest !== undefined) attempts.delete(oldest)
    }
    attempts.set(identifier, recordFailure(attempts.get(identifier), now))
  })

  next()
}

export default defineMiddlewares({
  routes: [
    {
      // 生徒（customer）と運営者（user）の両方の入口に掛ける。
      matcher: '/auth/*/emailpass',
      method: 'POST',
      middlewares: [loginGuard],
    },
  ],
})
