import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_MOTIFS,
  findTokenMismatches,
  parseCssTokens,
  parseMarkdownTokens,
} from './design-tokens.js';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const designDocPath = join(repoRoot, 'docs', 'design.md');
const tokensCssPath = join(repoRoot, 'apps', 'storefront', 'src', 'styles', 'tokens.css');

describe('デザインの決まりと実際の値', () => {
  it('文書に書いた値が CSS と一致している', () => {
    const markdown = readFileSync(designDocPath, 'utf8');
    const css = readFileSync(tokensCssPath, 'utf8');
    expect(findTokenMismatches(markdown, css)).toEqual([]);
  });

  it('文書から値を拾えている（表の形が変わったら気づけるように）', () => {
    const markdown = readFileSync(designDocPath, 'utf8');
    const documented = parseMarkdownTokens(markdown);
    expect(documented.get('--bg')).toBe('#FFFFFF');
    expect(documented.get('--accent')).toBe('#2563EB');
    expect(documented.size).toBeGreaterThan(15);
  });

  it('差し色は1色だけにしてある', () => {
    const css = readFileSync(tokensCssPath, 'utf8');
    const tokens = parseCssTokens(css);
    // --accent とその押したとき、その上の文字。これ以外に差し色を増やさない。
    const accents = [...tokens.keys()].filter((name) => name.startsWith('--accent'));
    expect(accents.sort()).toEqual(['--accent', '--accent-hover', '--accent-text']);
  });

  it('禁止したモチーフの語が CSS に出てこない', () => {
    const css = readFileSync(tokensCssPath, 'utf8').toLowerCase();
    const found = FORBIDDEN_MOTIFS.filter((motif) => css.includes(motif));
    expect(found).toEqual([]);
  });
});

describe('値の読み取り', () => {
  it('CSS の宣言を読み取れる', () => {
    const tokens = parseCssTokens(':root { --bg: #FFF; --sp-4: 16px; }');
    expect(tokens.get('--bg')).toBe('#FFF');
    expect(tokens.get('--sp-4')).toBe('16px');
  });

  it('複数行にまたがる値も1つにまとめる', () => {
    const tokens = parseCssTokens(':root { --font-sans:\n  system-ui,\n  sans-serif; }');
    expect(tokens.get('--font-sans')).toBe('system-ui, sans-serif');
  });

  it('文書側に無い値は食い違いとしない', () => {
    const mismatches = findTokenMismatches('（表なし）', ':root { --bg: #FFF; }');
    expect(mismatches).toEqual([]);
  });

  it('値が違えば食い違いとして返す', () => {
    const markdown = '| 背景 | `--bg` | `#FFFFFF` | ページ全体 |';
    const mismatches = findTokenMismatches(markdown, ':root { --bg: #000000; }');
    expect(mismatches).toEqual([{ token: '--bg', inDocument: '#FFFFFF', inCss: '#000000' }]);
  });

  it('CSS に無い値も食い違いとして返す', () => {
    const markdown = '| 背景 | `--bg` | `#FFFFFF` | ページ全体 |';
    const mismatches = findTokenMismatches(markdown, ':root { --text: #000; }');
    expect(mismatches).toEqual([{ token: '--bg', inDocument: '#FFFFFF', inCss: undefined }]);
  });
});
