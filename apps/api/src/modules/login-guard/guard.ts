/**
 * ログインの失敗が続いたときに一時的に止める仕組み（受け入れ基準 A6）。
 *
 * この仕組みは Market ID とパスワードだけでログインする。メールも電話も無いので、
 * **総当たりを止める手段がここしかない**。Market ID は32文字から8文字を選ぶので
 * 約1兆通りあるが、パスワードが弱ければ意味がない。
 *
 * ここは純粋な関数だけ。時刻は必ず引数で受け取り、内部で `Date.now()` を呼ばない
 * （呼ぶと「15分後にどうなるか」を試せなくなる）。
 */

/** 何回続けて失敗したら止めるか（既定値）。 */
export const MAX_ATTEMPTS = 5

/** 止める長さ（既定値、ミリ秒）。 */
export const LOCK_DURATION_MS = 15 * 60 * 1000

/** いま効いている決まり。先生が画面から変えられる（要件の前書き）。 */
export interface LoginPolicy {
  maxAttempts: number
  lockDurationMs: number
}

export const DEFAULT_LOGIN_POLICY: LoginPolicy = {
  maxAttempts: MAX_ATTEMPTS,
  lockDurationMs: LOCK_DURATION_MS,
}

/**
 * 実行中の決まり。**既定値から始まる。**
 *
 * 保存された設定があれば `setLoginPolicy` で上書きする（呼ぶのは
 * market-settings モジュール）。設定を読めないときは既定値のまま動く。
 *
 * ここを「毎回データベースから読む」形にしないのは、この判定が
 * ログインの入口で同期的に呼ばれるため。1回のログインごとに問い合わせると、
 * 総当たりされたときに数える処理そのものが負荷になる。
 */
let currentPolicy: LoginPolicy = { ...DEFAULT_LOGIN_POLICY }

/** 保存された設定を反映する。 */
export function setLoginPolicy(policy: Partial<LoginPolicy>): LoginPolicy {
  currentPolicy = {
    maxAttempts:
      Number.isInteger(policy.maxAttempts) && (policy.maxAttempts as number) > 0
        ? (policy.maxAttempts as number)
        : currentPolicy.maxAttempts,
    lockDurationMs:
      Number.isFinite(policy.lockDurationMs) && (policy.lockDurationMs as number) > 0
        ? (policy.lockDurationMs as number)
        : currentPolicy.lockDurationMs,
  }
  return currentPolicy
}

/** いま効いている決まりを読む。 */
export function getLoginPolicy(): LoginPolicy {
  return currentPolicy
}

/** テストのために既定値へ戻す。製品の中では呼ばない。 */
export function resetLoginPolicy(): void {
  currentPolicy = { ...DEFAULT_LOGIN_POLICY }
}

/**
 * 失敗を数えておく箱。**Market ID ごとに1つ**持つ。
 *
 * 数えるのは「続けて失敗した回数」で、1回でも成功したら0に戻す。
 */
export interface AttemptRecord {
  failures: number
  /** 最後に失敗した時刻。ここから LOCK_DURATION_MS を数える。 */
  lastFailedAt?: number
}

export interface LockState {
  locked: boolean
  /** あと何ミリ秒で解けるか。止まっていなければ0。 */
  remainingMs: number
  /** あと何回失敗すると止まるか。止まっていれば0。 */
  attemptsLeft: number
}

/**
 * いま止まっているかどうかを調べる。
 *
 * 決まりは引数で受け取れるようにしてある（試すときのため）。省略すると
 * いま効いている決まりを使うので、**呼ぶ側は設定の存在を知らなくてよい**。
 */
export function checkLock(
  record: AttemptRecord | undefined,
  now: number,
  policy: LoginPolicy = getLoginPolicy(),
): LockState {
  if (!record || record.failures < policy.maxAttempts || record.lastFailedAt === undefined) {
    return {
      locked: false,
      remainingMs: 0,
      attemptsLeft: Math.max(0, policy.maxAttempts - (record?.failures ?? 0)),
    }
  }

  const unlockAt = record.lastFailedAt + policy.lockDurationMs
  if (now >= unlockAt) {
    // 時間が過ぎていれば、数えていた失敗ごと無かったことにする。
    return { locked: false, remainingMs: 0, attemptsLeft: policy.maxAttempts }
  }

  return { locked: true, remainingMs: unlockAt - now, attemptsLeft: 0 }
}

/** 失敗を1回数える。 */
export function recordFailure(
  record: AttemptRecord | undefined,
  now: number,
  policy: LoginPolicy = getLoginPolicy(),
): AttemptRecord {
  const current = record ?? { failures: 0 }

  // 止まっていた時間が過ぎていたら、数え直しにする。
  if (
    current.lastFailedAt !== undefined &&
    current.failures >= policy.maxAttempts &&
    now >= current.lastFailedAt + policy.lockDurationMs
  ) {
    return { failures: 1, lastFailedAt: now }
  }

  return { failures: current.failures + 1, lastFailedAt: now }
}

/** 成功したので数えを0に戻す。 */
export function recordSuccess(): AttemptRecord {
  return { failures: 0 }
}

/**
 * 止まっている時間を、利用者に見せる分数に直す。
 *
 * ミリ秒のまま出しても伝わらない。1分未満は「1分」と言う（0分と出すと
 * 「すぐ試せる」と誤解される）。
 */
export function remainingMinutes(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / 60_000))
}
