/**
 * 辞書の過不足を機械で見つける（受け入れ基準 I2）。
 *
 * **目で見て揃えるのは無理。** 6言語 × 数百キーになると、1つ足りないことに
 * 誰も気づかない。気づかないまま授業で使うと、ある言語の生徒だけが
 * 意味の分からない画面を見ることになる。
 *
 * ファイルも HTTP も触らない純粋な関数だけを置く。読み込みは
 * `scripts/check-i18n-keys.mjs` と単体テストが行う。
 */

/**
 * `$t(terms.organization)` のような**他のキーの参照**を取り除く。
 *
 * 参照だけでできている文字列は、どの言語でも同じ綴りになる。
 * それを「日本語のまま」と数えると、呼び名を1箇所にまとめた途端に
 * 検査が誤って落ちる（実際に落ちた）。
 */
function withoutReferences(text: string): string {
  return text.replaceAll(/\$t\([^)]*\)/g, '').trim()
}

/** 文字列が参照している他のキー（`$t(...)` の中身）。 */
function referencesOf(text: string): string[] {
  return [...text.matchAll(/\$t\(([^)]*)\)/g)].map((match) => match[1]!.trim()).sort()
}

/** 入れ子の辞書を `a.b.c` の形に開く。 */
export function flattenKeys(value: unknown, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>()
  if (value === null || typeof value !== 'object') return flat

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child !== null && typeof child === 'object') {
      for (const [innerKey, innerValue] of flattenKeys(child, path)) flat.set(innerKey, innerValue)
      continue
    }
    flat.set(path, String(child))
  }

  return flat
}

/** 見つかった問題。1件ずつ「どの言語の、どのキーが、どうなのか」を持つ。 */
export interface KeyProblem {
  locale: string
  key: string
  /** `missing` = そのキーが無い／`empty` = 空文字／`untranslated` = 元の言語と同じ文字列 */
  kind: 'missing' | 'empty' | 'untranslated'
}

/**
 * 各言語の辞書を突き合わせる。
 *
 * 基準は `base`（日本語）。**基準に無いキーは問題にしない。**
 * 翻訳側だけに余分なキーがあっても画面は壊れないし、削除の途中である場合もある。
 * 困るのは「基準にあるのに翻訳が無い」ときだけ。
 *
 * `untranslated`（基準と同じ文字列）は**警告であって誤りではない**。
 * `MP` や `Market` のように、どの言語でもそのままで正しいものがある。
 * 判定に使う側が `allowSame` に並べておく。
 */
export function findKeyProblems(input: {
  base: { locale: string; dictionary: unknown }
  others: { locale: string; dictionary: unknown }[]
  /** 基準と同じ文字列でよいキー（`money.unit` など）。 */
  allowSame?: readonly string[]
}): KeyProblem[] {
  const baseKeys = flattenKeys(input.base.dictionary)
  const allowSame = new Set(input.allowSame ?? [])
  const problems: KeyProblem[] = []

  for (const other of input.others) {
    const keys = flattenKeys(other.dictionary)

    for (const [key, baseValue] of baseKeys) {
      const value = keys.get(key)

      if (value === undefined) {
        problems.push({ locale: other.locale, key, kind: 'missing' })
        continue
      }
      if (value.trim() === '') {
        problems.push({ locale: other.locale, key, kind: 'empty' })
        continue
      }
      /**
       * 参照だけでできている文字列（`$t(terms.organization)` など）は、
       * どの言語でも同じ綴りになるのが正しい。中身は参照先が持つ。
       */
      if (
        value === baseValue &&
        !allowSame.has(key) &&
        withoutReferences(baseValue) !== ''
      ) {
        problems.push({ locale: other.locale, key, kind: 'untranslated' })
      }
    }
  }

  return problems
}

/**
 * 差し込み（`{{count}}` など）が翻訳側でも同じか調べる。
 *
 * 翻訳のときに `{{count}}` を消したり綴りを変えたりすると、
 * **その言語だけ数字が出ない**。画面は壊れないので、動かして見ても気づきにくい。
 */
export function findPlaceholderProblems(input: {
  base: { locale: string; dictionary: unknown }
  others: { locale: string; dictionary: unknown }[]
}): { locale: string; key: string; expected: string[]; found: string[] }[] {
  const placeholdersOf = (text: string) =>
    [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]!).sort()

  const baseKeys = flattenKeys(input.base.dictionary)
  const problems: { locale: string; key: string; expected: string[]; found: string[] }[] = []

  for (const other of input.others) {
    const keys = flattenKeys(other.dictionary)
    for (const [key, baseValue] of baseKeys) {
      const value = keys.get(key)
      if (value === undefined) continue

      /**
       * 差し込み（`{{count}}`）は**数まで含めてぴったり同じ**でなければならない。
       * 落ちると、その言語だけ数字が出ない。
       */
      const expected = placeholdersOf(baseValue)
      const found = placeholdersOf(value)
      if (expected.join(',') !== found.join(',')) {
        problems.push({ locale: other.locale, key, expected, found })
      }

      /**
       * 呼び名の参照（`$t(terms.organization)`）は**あるか無いか**だけを見る。
       *
       * 言語によって語の数も形も変わる（日本語は「企業と企業」、英語は
       * 「companies」1語）。数まで合わせようとすると、正しい訳のほうを
       * 曲げることになる。**一度も参照していない**ときだけ問題にする。
       * それだと、その言語だけ呼び名の差し替えが効かなくなるため。
       */
      if (referencesOf(baseValue).length > 0 && referencesOf(value).length === 0) {
        problems.push({
          locale: other.locale,
          key,
          expected: referencesOf(baseValue),
          found: [],
        })
      }
    }
  }

  return problems
}
