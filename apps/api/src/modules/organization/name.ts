/**
 * 企業名の決まり（受け入れ基準 B1）。純粋な関数だけを置く。
 *
 * 名前は市場で唯一の手がかりになる（誰が動かしているかは出さない、要件38）ので、
 * 見分けがつかない名前を許すと、なりすましに近いことが起きる。
 */

export const MIN_NAME_LENGTH = 1
export const MAX_NAME_LENGTH = 40

export type NameProblem =
  | 'empty'
  | 'too_long'
  /** 見えない文字だけ、あるいは記号だけで、読める字が無い。 */
  | 'no_visible_characters'
  /** 制御文字が混ざっている（画面の表示を壊せてしまう）。 */
  | 'control_characters'

/**
 * 前後の空白を落とし、途中の連続した空白を1つにまとめる。
 *
 * 「NEKO  DESIGN」と「NEKO DESIGN」を別の名前として通すと、
 * 見た目が同じ企業が2つ並んでしまう。
 */
export function normalizeName(input: string): string {
  return input.trim().replaceAll(/\s+/g, ' ')
}

/**
 * 重複を判定するための形にする。
 *
 * 大文字小文字と全角半角の違いだけの名前は「同じ名前」とみなす。
 * `NEKO DESIGN` と `neko design` が並ぶと見分けられない。
 */
export function nameKey(input: string): string {
  return normalizeName(input).normalize('NFKC').toLowerCase()
}

/** 使ってよい名前かどうか。問題があればその種類を返す。 */
export function checkName(input: string): NameProblem | undefined {
  const normalized = normalizeName(input)

  if (normalized.length < MIN_NAME_LENGTH) return 'empty'
  if (normalized.length > MAX_NAME_LENGTH) return 'too_long'

  // 改行やタブが入ると、一覧の表示や書き出しが崩れる。
  if (/[\p{Cc}\p{Cf}]/u.test(normalized)) return 'control_characters'

  // 記号や空白だけの名前は、市場で他社と見分けられない。
  if (!/[\p{L}\p{N}]/u.test(normalized)) return 'no_visible_characters'

  return undefined
}

/** 使ってよい名前か（真偽値だけ要るとき）。 */
export function isValidName(input: string): boolean {
  return checkName(input) === undefined
}
