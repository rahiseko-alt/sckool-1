import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { findKeyProblems, findPlaceholderProblems, flattenKeys } from './keys'
import { ALLOW_SAME_AS_BASE, BASE_LOCALE } from './settings'
import { LOCALES } from './locales'

const here = dirname(fileURLToPath(import.meta.url))
const load = (locale: string) => JSON.parse(readFileSync(join(here, `${locale}.json`), 'utf8'))

describe('キーの開き方', () => {
  it('入れ子を a.b.c の形にする', () => {
    expect([...flattenKeys({ a: { b: { c: 'x' } }, d: 'y' })]).toEqual([
      ['a.b.c', 'x'],
      ['d', 'y'],
    ])
  })

  it('空の辞書は空になる', () => {
    expect(flattenKeys({}).size).toBe(0)
  })
})

describe('辞書の突き合わせ', () => {
  const base = { locale: 'ja-JP', dictionary: { nav: { market: '市場', rules: 'ルール' } } }

  it('足りないキーを見つける', () => {
    const problems = findKeyProblems({
      base,
      others: [{ locale: 'en', dictionary: { nav: { market: 'Market' } } }],
    })
    expect(problems).toEqual([{ locale: 'en', key: 'nav.rules', kind: 'missing' }])
  })

  it('空文字を見つける', () => {
    const problems = findKeyProblems({
      base,
      others: [{ locale: 'en', dictionary: { nav: { market: 'Market', rules: '  ' } } }],
    })
    expect(problems).toEqual([{ locale: 'en', key: 'nav.rules', kind: 'empty' }])
  })

  it('基準と同じ文字列のままなら「未翻訳」として出す', () => {
    const problems = findKeyProblems({
      base,
      others: [{ locale: 'en', dictionary: { nav: { market: '市場', rules: 'Rules' } } }],
    })
    expect(problems).toEqual([{ locale: 'en', key: 'nav.market', kind: 'untranslated' }])
  })

  it('そのままでよいキーは「未翻訳」にしない', () => {
    // MP や商品名のように、どの言語でも同じ文字列で正しいものがある。
    const problems = findKeyProblems({
      base: { locale: 'ja-JP', dictionary: { money: { unit: 'MP' } } },
      others: [{ locale: 'en', dictionary: { money: { unit: 'MP' } } }],
      allowSame: ['money.unit'],
    })
    expect(problems).toEqual([])
  })

  it('翻訳側だけにある余分なキーは問題にしない', () => {
    const problems = findKeyProblems({
      base: { locale: 'ja-JP', dictionary: { nav: { market: '市場' } } },
      others: [{ locale: 'en', dictionary: { nav: { market: 'Market', extra: 'Extra' } } }],
    })
    expect(problems).toEqual([])
  })
})

describe('差し込みの突き合わせ', () => {
  it('翻訳で {{count}} が消えていたら見つける', () => {
    // 画面は壊れないので、動かして見ても気づきにくい。
    const problems = findPlaceholderProblems({
      base: { locale: 'ja-JP', dictionary: { market: { count: '{{count}} 件' } } },
      others: [{ locale: 'en', dictionary: { market: { count: 'items' } } }],
    })
    expect(problems).toEqual([
      { locale: 'en', key: 'market.count', expected: ['count'], found: [] },
    ])
  })

  it('綴りが違っても見つける', () => {
    const problems = findPlaceholderProblems({
      base: { locale: 'ja-JP', dictionary: { market: { count: '{{count}} 件' } } },
      others: [{ locale: 'en', dictionary: { market: { count: '{{cnt}} items' } } }],
    })
    expect(problems).toHaveLength(1)
  })

  it('同じなら何も出ない', () => {
    const problems = findPlaceholderProblems({
      base: { locale: 'ja-JP', dictionary: { market: { count: '{{count}} 件' } } },
      others: [{ locale: 'en', dictionary: { market: { count: '{{count}} items' } } }],
    })
    expect(problems).toEqual([])
  })
})

describe('実際の辞書（受け入れ基準 I2）', () => {
  const base = { locale: BASE_LOCALE, dictionary: load(BASE_LOCALE) }
  const others = LOCALES.filter((locale) => locale.code !== BASE_LOCALE).map((locale) => ({
    locale: locale.code,
    dictionary: load(locale.code),
  }))

  it('6言語ぶんの辞書がある', () => {
    expect(LOCALES).toHaveLength(6)
    expect(others).toHaveLength(5)
  })

  it('未翻訳のキーが0件', () => {
    expect(findKeyProblems({ base, others, allowSame: ALLOW_SAME_AS_BASE })).toEqual([])
  })

  it('差し込みが全ての言語で揃っている', () => {
    expect(findPlaceholderProblems({ base, others })).toEqual([])
  })

  it('売れない理由のキーが API の返す値と揃っている', () => {
    // API は not_started / ended / sold_out を返す。辞書のキーが違うと、
    // 画面に理由が出ないまま「買えない」とだけ表示される。
    const keys = [...flattenKeys(base.dictionary).keys()]
    for (const reason of ['not_started', 'ended', 'sold_out']) {
      expect(keys).toContain(`unavailable.${reason}`)
    }
  })
})
