/**
 * 画面のコードに日本語を直接書いていないかを調べる（受け入れ基準 I2・J2）。
 *
 * **1つでも直接書くと、その行だけ切り替わらないまま残る。** ほかの言語を
 * 選んでいる生徒にはそこだけ読めない箇所になり、動かして見ても
 * 日本語で見ている限り気づけない。
 *
 * ファイルを読むのは呼ぶ側。ここは文字列を見るだけの純粋な関数を置く。
 */

/** 見つかった1件。 */
export interface HardcodedText {
  line: number
  text: string
}

/** 日本語（ひらがな・カタカナ・漢字）を含むか。 */
const JAPANESE = /[぀-ゟ゠-ヿ㐀-鿿]/

/**
 * コメントを落とす。
 *
 * **コメントの日本語は問題にしない。** むしろ「なぜそうしたか」は
 * 日本語で書く決まりにしてある（`AGENTS.md`）。困るのは画面に出る文字列だけ。
 */
function withoutComments(source: string): string[] {
  const lines = source.split('\n')
  const kept: string[] = []
  let inBlock = false

  for (const line of lines) {
    let text = line

    if (inBlock) {
      const end = text.indexOf('*/')
      if (end < 0) {
        kept.push('')
        continue
      }
      text = text.slice(end + 2)
      inBlock = false
    }

    // 1行の途中から始まるブロックコメント。
    for (;;) {
      const start = text.indexOf('/*')
      if (start < 0) break
      const end = text.indexOf('*/', start + 2)
      if (end < 0) {
        text = text.slice(0, start)
        inBlock = true
        break
      }
      text = text.slice(0, start) + text.slice(end + 2)
    }

    const lineComment = text.indexOf('//')
    if (lineComment >= 0) text = text.slice(0, lineComment)

    kept.push(text)
  }

  return kept
}

/**
 * 画面のコードから、直接書かれた日本語を探す。
 *
 * `allow` に書いた文字列を含む行は見逃す。**むやみに増やさないこと。**
 * 逃がした行はその言語の生徒に読めないまま残る。
 */
export function findHardcodedJapanese(
  source: string,
  allow: readonly string[] = [],
): HardcodedText[] {
  const found: HardcodedText[] = []

  withoutComments(source).forEach((line, index) => {
    if (!JAPANESE.test(line)) return
    if (allow.some((allowed) => line.includes(allowed))) return
    found.push({ line: index + 1, text: line.trim() })
  })

  return found
}
