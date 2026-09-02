/**
 * 授業ごとに変えられる数字の既定値と、その入力の検査
 * （`docs/requirements.md` 第2部の前書き、受け入れ基準 A6・B2・H2）。
 *
 * **既定値はコードに持ち続ける。** 保存された値が無いとき・壊れているときは
 * ここに戻る。設定が空だと動かない作りにすると、データベースを入れ直した直後に
 * 仕組み全体が止まる。
 *
 * ここは純粋な関数だけ。保存も読み出しもしない（それは service.ts）。
 */

/** 画面から変えられる数字の名前。 */
export const MARKET_SETTING_KEYS = [
  'initial_funds',
  'login_max_attempts',
  'login_lock_minutes',
  'mutual_trade_threshold',
] as const

export type MarketSettingKey = (typeof MARKET_SETTING_KEYS)[number]

export type MarketSettings = Record<MarketSettingKey, number>

/**
 * 既定値。要件の本文に書かれている数字をそのまま置く。
 *
 * - `initial_funds` … 要件3「初期資金 100,000 MP」
 * - `login_max_attempts` / `login_lock_minutes` … 受け入れ基準 A6「5回失敗で15分」
 * - `mutual_trade_threshold` … 受け入れ基準 H2「30%を超えた組を強調」
 */
export const MARKET_SETTING_DEFAULTS: MarketSettings = {
  initial_funds: 100_000,
  login_max_attempts: 5,
  login_lock_minutes: 15,
  mutual_trade_threshold: 30,
}

/**
 * 入れてよい範囲。
 *
 * **上限を置くのは打ち間違いを止めるため。** 0 を1つ多く打った初期資金や、
 * 1万分のロックは、授業の途中では取り返しがつかない。
 */
export const MARKET_SETTING_RANGES: Record<MarketSettingKey, { min: number; max: number }> = {
  initial_funds: { min: 1, max: 10_000_000 },
  login_max_attempts: { min: 1, max: 100 },
  login_lock_minutes: { min: 1, max: 1_440 },
  mutual_trade_threshold: { min: 1, max: 100 },
}

export type SettingProblemCode = 'unknown_key' | 'not_an_integer' | 'out_of_range'

/** 見つかった問題。画面が訳せるように、文ではなく**符号**で返す。 */
export interface SettingProblem {
  key: string
  code: SettingProblemCode
  min?: number
  max?: number
}

function isSettingKey(key: string): key is MarketSettingKey {
  return (MARKET_SETTING_KEYS as readonly string[]).includes(key)
}

/**
 * 保存してよい入力かどうかを調べる。問題が無ければ空の配列。
 *
 * **知らない名前は黙って捨てずに断る。** 綴りを間違えたまま「保存しました」と
 * 出ると、先生は変えたつもりで変わっていない状態に気づけない。
 */
export function checkMarketSettings(input: Readonly<Record<string, unknown>>): SettingProblem[] {
  const problems: SettingProblem[] = []

  for (const [key, raw] of Object.entries(input)) {
    if (!isSettingKey(key)) {
      problems.push({ key, code: 'unknown_key' })
      continue
    }

    // 画面の入力欄は文字列を返す。数に直せるものは受け取る。
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      problems.push({ key, code: 'not_an_integer' })
      continue
    }

    const range = MARKET_SETTING_RANGES[key]
    if (value < range.min || value > range.max) {
      problems.push({ key, code: 'out_of_range', min: range.min, max: range.max })
    }
  }

  return problems
}

/** 検査を通った入力を数だけの形にそろえる。**通す前に呼ばないこと。** */
export function normalizeMarketSettings(
  input: Readonly<Record<string, unknown>>,
): Partial<MarketSettings> {
  const normalized: Partial<MarketSettings> = {}
  for (const [key, raw] of Object.entries(input)) {
    if (!isSettingKey(key)) continue
    normalized[key] = Number(raw)
  }
  return normalized
}

/**
 * 保存されている値を既定値にかぶせる。
 *
 * **壊れている値は既定値に戻す。** データベースを手で書き換えられた場合でも、
 * 画面が数字を出せなくなるより既定値で動くほうがよい。
 */
export function mergeMarketSettings(
  stored: Readonly<Record<string, unknown>> | undefined,
): MarketSettings {
  const merged: MarketSettings = { ...MARKET_SETTING_DEFAULTS }
  if (!stored) return merged

  for (const key of MARKET_SETTING_KEYS) {
    const value = stored[key]
    if (checkMarketSettings({ [key]: value }).length === 0) {
      merged[key] = Number(value)
    }
  }

  return merged
}
