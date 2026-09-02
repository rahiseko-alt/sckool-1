/**
 * 商品名と説明の翻訳の選び方（受け入れ基準 I3）。
 *
 * データベースにも HTTP にも触らない純粋な関数だけを置く。
 */

/** 1件の訳。 */
export interface Translation {
  locale_code: string
  title: string
  description: string
}

/** 画面に出す商品名と説明。 */
export interface DisplayText {
  title: string
  description: string
  /** どの言語の訳を使ったか。原文のときは `undefined`。 */
  locale_code?: string
}

/**
 * 閲覧者の言語に合う訳を選ぶ。無ければ原文を返す（受け入れ基準 I3）。
 *
 * **訳が無いときにキーや空文字を出さない。** 原文が読めなくても、
 * 何も出ないよりは手がかりになる。
 *
 * 訳の一部だけ（商品名だけ入れて説明は空）でも受け付け、**空の側は原文を使う**。
 * 全部そろわないと出ない作りにすると、途中まで訳した労力が無駄になる。
 */
export function pickTranslation(
  original: { title: string; description: string },
  translations: readonly Translation[],
  locale: string | undefined,
): DisplayText {
  if (!locale) return { title: original.title, description: original.description }

  const exact = translations.find((translation) => translation.locale_code === locale)
  /**
   * `ja-JP` を選んでいる人に `ja` の訳を出す、のような取りこぼしを拾う。
   * 言語だけ合っていれば、地域が違っても読めることのほうが多い。
   */
  const sameLanguage = translations.find(
    (translation) => translation.locale_code.split('-')[0] === locale.split('-')[0],
  )
  const found = exact ?? sameLanguage
  if (!found) return { title: original.title, description: original.description }

  return {
    title: found.title.trim() === '' ? original.title : found.title,
    description: found.description.trim() === '' ? original.description : found.description,
    locale_code: found.locale_code,
  }
}

/** 訳の入力に問題があれば返す。空配列なら受け付けてよい。 */
export type TranslationProblem = 'unknown_locale' | 'too_long'

/** 訳の長さの上限。原文と同じにしておく。 */
const MAX_TITLE = 80
const MAX_DESCRIPTION = 2_000

/**
 * 訳の入力を確かめる。
 *
 * **訳は任意**なので、空の入力は問題にしない（受け入れ基準 I3）。
 * 訳を必須にすると、6言語ぶん書けない生徒は商品を出せなくなる。
 */
export function checkTranslations(
  input: unknown,
  allowedLocales: readonly string[],
): { locale_code: string; problem: TranslationProblem }[] {
  if (!Array.isArray(input)) return []

  const problems: { locale_code: string; problem: TranslationProblem }[] = []

  for (const raw of input) {
    if (raw === null || typeof raw !== 'object') continue
    const entry = raw as { locale_code?: unknown; title?: unknown; description?: unknown }
    const locale = typeof entry.locale_code === 'string' ? entry.locale_code : ''

    if (!allowedLocales.includes(locale)) {
      problems.push({ locale_code: locale, problem: 'unknown_locale' })
      continue
    }
    if (
      (typeof entry.title === 'string' && entry.title.length > MAX_TITLE) ||
      (typeof entry.description === 'string' && entry.description.length > MAX_DESCRIPTION)
    ) {
      problems.push({ locale_code: locale, problem: 'too_long' })
    }
  }

  return problems
}

/** 保存できる形にそろえる。空だけの訳は捨てる（行を作る意味が無い）。 */
export function normalizeTranslations(
  input: unknown,
  allowedLocales: readonly string[],
): Translation[] {
  if (!Array.isArray(input)) return []

  const byLocale = new Map<string, Translation>()

  for (const raw of input) {
    if (raw === null || typeof raw !== 'object') continue
    const entry = raw as { locale_code?: unknown; title?: unknown; description?: unknown }
    const locale = typeof entry.locale_code === 'string' ? entry.locale_code : ''
    if (!allowedLocales.includes(locale)) continue

    const title = typeof entry.title === 'string' ? entry.title.trim() : ''
    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    if (title === '' && description === '') continue

    // 同じ言語が2つ来たら、あとに書いたほうを採る。
    byLocale.set(locale, { locale_code: locale, title, description })
  }

  return [...byLocale.values()]
}
