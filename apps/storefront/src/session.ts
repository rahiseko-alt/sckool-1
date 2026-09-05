/**
 * いまログインしている企業（受け入れ基準 A2・D1）。
 *
 * **合鍵はサーバーが名乗りを確かめるための唯一の材料。** 画面がどこかに
 * Market ID を持って送る形にすると、他社を名乗れてしまう
 * （`docs/decisions.md`「37.」）。ここで持つのも合鍵が主で、
 * Market ID と企業名は画面に出すためだけに覚えておく。
 */

export interface Session {
  marketId: string
  organizationName: string
  token: string
}

const STORAGE_KEY = 'sckool.session'

/**
 * 覚えているログインを読む。
 *
 * **読めなくても画面は出す。** ブラウザの設定で保存が禁じられていると
 * `localStorage` に触れるだけで例外が出る。ここで落とすと市場を開けなくなる。
 */
export function readSession(): Session | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<Session>
    if (
      typeof parsed.marketId !== 'string' ||
      typeof parsed.organizationName !== 'string' ||
      typeof parsed.token !== 'string'
    ) {
      return undefined
    }
    return { marketId: parsed.marketId, organizationName: parsed.organizationName, token: parsed.token }
  } catch {
    return undefined
  }
}

export function saveSession(session: Session): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // 覚えられないだけ。今回の操作は続けられる。
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 消せなくても、画面の上ではログアウトしている。
  }
}
