/**
 * テストの中身（題名・題目・設問・選択肢）の翻訳の選び方（受け入れ基準 I3 をテストに広げる）。
 *
 * データベースにも HTTP にも触らない純粋な関数だけを置く。商品の翻訳（catalog/translation.ts）と
 * 同じ考え方だが、テストは1件の中に複数の設問があり、**選択肢の並びが正解の位置（correctIndex）と
 * 結びついている**ため、選択肢の翻訳は「原文と同じ数・同じ並び」でなければならない。
 * ここがずれると、ある言語だけ別の選択肢が正解になってしまう。だから数が合わない訳は弾く。
 */

/** 1問ぶんの訳。選択肢は原文と**同じ数・同じ並び**で、位置だけ訳す。 */
export interface QuestionTranslation {
  /** どの設問の訳か。原文の設問 id と一致させる。 */
  id: string
  prompt: string
  choices: string[]
}

/** 1言語ぶんのテストの訳。題名・題目・設問すべて任意（入れた分だけ使う）。 */
export interface QuizTranslation {
  locale_code: string
  title?: string
  topic?: string
  questions?: QuestionTranslation[]
}

/** 原文（正解を含まない、表示に使う部分だけ）。 */
export interface QuizOriginal {
  title: string
  topic: string
  questions: { id: string; prompt: string; choices: string[] }[]
}

/** 画面に出すテスト（正解は含まない）。 */
export interface QuizDisplay {
  title: string
  topic: string
  questions: { id: string; prompt: string; choices: string[] }[]
  /** どの言語の訳を使ったか。原文のときは `undefined`。 */
  locale_code?: string
}

/** `ja-JP` を選んでいる人に `ja` の訳を拾う、のような地域違いを吸収して1件選ぶ。 */
function findForLocale<T extends { locale_code: string }>(
  items: readonly T[],
  locale: string,
): T | undefined {
  const exact = items.find((t) => t.locale_code === locale)
  if (exact) return exact
  return items.find((t) => t.locale_code.split('-')[0] === locale.split('-')[0])
}

/**
 * 閲覧者の言語に合う訳を当てて、画面に出すテストを作る。無ければ原文（受け入れ基準 I3）。
 *
 * **一部だけの訳でも受け付ける。** 訳が空の項目は原文を使う。
 * **選択肢は、数が原文と一致する設問だけ差し替える。** 数が違う訳は、正解の位置が
 * ずれるので使わない（原文の選択肢のまま出す）。訳の検査（`checkQuizTranslations`）で
 * 保存前に弾くが、万一おかしなデータが残っていても安全側に倒す。
 */
export function pickQuizTranslation(
  original: QuizOriginal,
  translations: readonly QuizTranslation[],
  locale: string | undefined,
): QuizDisplay {
  if (!locale) return { ...original }

  const found = findForLocale(translations, locale)
  if (!found) return { ...original }

  const byId = new Map((found.questions ?? []).map((q) => [q.id, q]))

  const questions = original.questions.map((q) => {
    const t = byId.get(q.id)
    const prompt = t && t.prompt.trim() !== '' ? t.prompt : q.prompt
    // 選択肢は「数が一致し、すべて空でない」ときだけ差し替える。
    const choices =
      t && Array.isArray(t.choices) && t.choices.length === q.choices.length
        ? q.choices.map((original, i) => (t.choices[i].trim() !== '' ? t.choices[i] : original))
        : q.choices
    return { id: q.id, prompt, choices }
  })

  return {
    title: found.title && found.title.trim() !== '' ? found.title : original.title,
    topic: found.topic && found.topic.trim() !== '' ? found.topic : original.topic,
    questions,
    locale_code: found.locale_code,
  }
}

/** 訳の入力の問題。 */
export type QuizTranslationProblemCode =
  | 'unknown_locale'
  | 'too_long'
  | 'unknown_question'
  | 'choices_count_mismatch'

export interface QuizTranslationProblem {
  locale_code: string
  code: QuizTranslationProblemCode
  /** どの設問で起きたか（設問に関する問題のとき）。 */
  question_id?: string
}

const MAX_TITLE = 120
const MAX_PROMPT = 500
const MAX_CHOICE = 200

/**
 * 訳の入力を確かめる（保存の前に呼ぶ）。
 *
 * **訳は任意**なので空は問題にしない。ただし選択肢を訳すなら、**原文と同じ数**でなければ
 * ならない（正解の位置がずれるため）。原文に無い設問 id の訳も弾く。
 */
export function checkQuizTranslations(
  input: unknown,
  original: QuizOriginal,
  allowedLocales: readonly string[],
): QuizTranslationProblem[] {
  if (!Array.isArray(input)) return []

  const problems: QuizTranslationProblem[] = []
  const countById = new Map(original.questions.map((q) => [q.id, q.choices.length]))

  for (const raw of input) {
    if (raw === null || typeof raw !== 'object') continue
    const entry = raw as QuizTranslation
    const locale = typeof entry.locale_code === 'string' ? entry.locale_code : ''

    if (!allowedLocales.includes(locale)) {
      problems.push({ locale_code: locale, code: 'unknown_locale' })
      continue
    }

    if (
      (typeof entry.title === 'string' && entry.title.length > MAX_TITLE) ||
      (typeof entry.topic === 'string' && entry.topic.length > MAX_TITLE)
    ) {
      problems.push({ locale_code: locale, code: 'too_long' })
    }

    for (const q of entry.questions ?? []) {
      if (q === null || typeof q !== 'object' || typeof q.id !== 'string') continue
      const expected = countById.get(q.id)
      if (expected === undefined) {
        problems.push({ locale_code: locale, code: 'unknown_question', question_id: q.id })
        continue
      }
      if (Array.isArray(q.choices) && q.choices.length > 0 && q.choices.length !== expected) {
        // 選択肢を訳すなら全部そろえる。数が違うと正解の位置がずれる。
        problems.push({ locale_code: locale, code: 'choices_count_mismatch', question_id: q.id })
      }
      if (
        (typeof q.prompt === 'string' && q.prompt.length > MAX_PROMPT) ||
        (Array.isArray(q.choices) && q.choices.some((c) => typeof c === 'string' && c.length > MAX_CHOICE))
      ) {
        problems.push({ locale_code: locale, code: 'too_long', question_id: q.id })
      }
    }
  }

  return problems
}

/** 保存できる形にそろえる。中身が空の言語・設問は捨てる。 */
export function normalizeQuizTranslations(
  input: unknown,
  original: QuizOriginal,
  allowedLocales: readonly string[],
): QuizTranslation[] {
  if (!Array.isArray(input)) return []

  const validId = new Set(original.questions.map((q) => q.id))
  const countById = new Map(original.questions.map((q) => [q.id, q.choices.length]))
  const byLocale = new Map<string, QuizTranslation>()

  for (const raw of input) {
    if (raw === null || typeof raw !== 'object') continue
    const entry = raw as QuizTranslation
    const locale = typeof entry.locale_code === 'string' ? entry.locale_code : ''
    if (!allowedLocales.includes(locale)) continue

    const title = typeof entry.title === 'string' ? entry.title.trim() : ''
    const topic = typeof entry.topic === 'string' ? entry.topic.trim() : ''

    const questions: QuestionTranslation[] = []
    for (const q of entry.questions ?? []) {
      if (q === null || typeof q !== 'object' || typeof q.id !== 'string') continue
      if (!validId.has(q.id)) continue
      const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : ''
      const choices = Array.isArray(q.choices) ? q.choices.map((c) => (typeof c === 'string' ? c.trim() : '')) : []
      // 選択肢は原文と同じ数のときだけ採る（数が違うと正解の位置がずれる）。
      const keepChoices = choices.length === countById.get(q.id) && choices.some((c) => c !== '')
      if (prompt === '' && !keepChoices) continue
      questions.push({ id: q.id, prompt, choices: keepChoices ? choices : [] })
    }

    if (title === '' && topic === '' && questions.length === 0) continue
    byLocale.set(locale, { locale_code: locale, title, topic, questions })
  }

  return [...byLocale.values()]
}
