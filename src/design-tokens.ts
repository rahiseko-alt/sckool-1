/**
 * デザインの決まり（docs/design.md）と実際の値（tokens.css）が一致しているかを調べる。
 *
 * 2箇所に同じ値を書く形にしたのは、人が読む説明と機械が使う値の両方が要るため。
 * ただし**2箇所あるものは必ずずれる**ので、ずれを機械で見つけられるようにしておく。
 */

/** `--名前: 値;` の形を1行ずつ拾う。 */
export function parseCssTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  // 宣言のうち、カスタムプロパティ（`--` で始まるもの）だけを見る。
  const pattern = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const match of css.matchAll(pattern)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    tokens.set(`--${name}`, value.trim().replaceAll(/\s+/g, ' '));
  }
  return tokens;
}

/** Markdown の表から「`--名前`」と「`値`」の組を拾う。 */
export function parseMarkdownTokens(markdown: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const nameCell = cells.find((cell) => /^`--[a-z0-9-]+`$/i.test(cell));
    if (!nameCell) continue;
    const nameIndex = cells.indexOf(nameCell);
    const valueCell = cells.slice(nameIndex + 1).find((cell) => /^`[^`]+`$/.test(cell));
    if (!valueCell) continue;
    tokens.set(nameCell.slice(1, -1), valueCell.slice(1, -1));
  }
  return tokens;
}

export interface TokenMismatch {
  token: string;
  inDocument: string | undefined;
  inCss: string | undefined;
}

/**
 * 文書と CSS を突き合わせ、食い違いを全て返す。空配列なら一致している。
 *
 * CSS 側にだけある値（`--text-body` のような、表に載せていない細かいもの）は
 * 食い違いとしない。**文書に書いた約束が守られているか**だけを見る。
 */
export function findTokenMismatches(markdown: string, css: string): TokenMismatch[] {
  const documented = parseMarkdownTokens(markdown);
  const actual = parseCssTokens(css);
  const mismatches: TokenMismatch[] = [];

  for (const [token, expected] of documented) {
    const found = actual.get(token);
    if (found === undefined) {
      mismatches.push({ token, inDocument: expected, inCss: undefined });
      continue;
    }
    if (normalize(found) !== normalize(expected)) {
      mismatches.push({ token, inDocument: expected, inCss: found });
    }
  }

  return mismatches;
}

/**
 * 大文字小文字と空白の入れ方は違いとみなさない。
 *
 * CSS は Prettier が整形するので `rgba(0,0,0,0.04)` が `rgba(0, 0, 0, 0.04)` になる。
 * これを食い違いとして扱うと、整形するたびに検査が落ちて誰も直さなくなる。
 */
function normalize(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/g, '');
}

/**
 * 要件40で禁じたモチーフ。**画面にこれらが出たら不合格**（受け入れ基準 J1）。
 *
 * ここにあるのは「コードの中でうっかり使いそうな語」で、絵そのものは機械では見つけられない。
 * 最終的な判定は人が画面を見て行う（`T042`）。
 */
export const FORBIDDEN_MOTIFS = [
  'blackboard',
  'chalkboard',
  'chalk',
  'pencil',
  'notebook',
  'school',
  'graduation',
  'confetti',
  'coin',
  'badge',
  'trophy',
  'level-up',
  'xp',
] as const;
