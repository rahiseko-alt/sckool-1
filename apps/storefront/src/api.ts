/**
 * バックエンドの呼び出し。
 *
 * **エラーは必ず「辞書のキー」に直してから画面へ渡す。** サーバーが返す文言を
 * そのまま出すと、その部分だけ日本語（または英語）のまま残り、
 * 日本語を読めない生徒には意味が分からなくなる（受け入れ基準 I2）。
 */

declare const __BACKEND_URL__: string
declare const __PUBLISHABLE_KEY__: string

export interface ApiResult<T> {
  ok: boolean
  status: number
  data?: T
  /** 失敗したときに画面へ出す文言のキー（`errors.*`）。 */
  errorKey?: string
  /**
   * 項目ごとの問題（商品の登録で使う）。
   *
   * **文言ではなく「どの項目がどういう問題か」だけ**をサーバーから受け取る。
   * 文言をサーバーが作ると、ほかの言語を選んでいる生徒の画面にその行だけ
   * 日本語が出る（受け入れ基準 I2）。
   */
  problems?: { field: string; problem: string }[]
}

/** サーバーが返す合図と、辞書のキーの対応。 */
const ERROR_KEYS = new Set([
  'password_too_short',
  'organization_name_invalid',
  'organization_name_taken',
  'market_id_unavailable',
  'cannot_buy_own_listing',
  'insufficient_balance',
  'listing_not_found',
  'listing_unavailable',
  'login_required',
  'too_many_attempts',
])

/**
 * 合図を辞書のキーに直す。
 *
 * 知らない合図は `unknown` にする。**そのまま画面に出さない。**
 * 内部の名前が出ても生徒には読めないし、何を直せばよいかも伝わらない。
 */
export function errorKeyOf(status: number, code: unknown): string {
  if (status === 401) return 'invalid_login'
  if (typeof code === 'string' && ERROR_KEYS.has(code)) return code
  return 'unknown'
}

export async function api<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-publishable-api-key': __PUBLISHABLE_KEY__,
  }
  // 企業として行う操作には合鍵が要る。本文に Market ID を書いても名乗れない。
  if (options.token) headers.authorization = `Bearer ${options.token}`

  let response: Response
  try {
    response = await fetch(`${__BACKEND_URL__}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
  } catch {
    return { ok: false, status: 0, errorKey: 'unknown' }
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }

  if (!response.ok) {
    const body = parsed as { code?: unknown; problems?: unknown } | undefined
    const problems = Array.isArray(body?.problems)
      ? (body.problems as { field: string; problem: string }[])
      : undefined
    return {
      ok: false,
      status: response.status,
      errorKey: errorKeyOf(response.status, body?.code),
      ...(problems ? { problems } : {}),
    }
  }

  return { ok: true, status: response.status, data: parsed as T }
}
