import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// 判定の中身は生徒の画面と同じものを使う。**書き写して2箇所に持たない。**
import {
  findKeyProblems,
  findPlaceholderProblems,
  flattenKeys,
} from '../../../storefront/src/i18n/keys'
import { LOCALES as STOREFRONT_LOCALES } from '../../../storefront/src/i18n/locales'
import { LOCALES } from './locales'
import { ALLOW_SAME_AS_BASE, BASE_LOCALE } from './settings'

const here = dirname(fileURLToPath(import.meta.url))
const load = (locale: string) => JSON.parse(readFileSync(join(here, `${locale}.json`), 'utf8'))

describe('先生が見る画面の辞書（受け入れ基準 I1・I2）', () => {
  const base = { locale: BASE_LOCALE, dictionary: load(BASE_LOCALE) }
  const others = LOCALES.filter((locale) => locale.code !== BASE_LOCALE).map((locale) => ({
    locale: locale.code,
    dictionary: load(locale.code),
  }))

  it('6言語ぶんの辞書がある', () => {
    expect(LOCALES).toHaveLength(6)
    expect(others).toHaveLength(5)
  })

  it('生徒の画面と同じ6言語である', () => {
    // 片方だけ言語が増えると、先生と生徒で見えるものが食い違う。
    expect(LOCALES.map((locale) => locale.code)).toEqual(
      STOREFRONT_LOCALES.map((locale) => locale.code),
    )
  })

  it('未翻訳のキーが0件', () => {
    expect(findKeyProblems({ base, others, allowSame: ALLOW_SAME_AS_BASE })).toEqual([])
  })

  it('差し込みが全ての言語で揃っている', () => {
    expect(findPlaceholderProblems({ base, others })).toEqual([])
  })

  it('3つの画面ぶんのキーが揃っている', () => {
    // 画面を足したのに辞書を足し忘れると、その画面だけ日本語のままになる。
    const keys = [...flattenKeys(base.dictionary).keys()]
    for (const key of [
      'organizations.title',
      'organizations.columns.organizationName',
      'tradeAnalysis.title',
      'tradeAnalysis.mutual.description',
      'purchaseLog.title',
      'purchaseLog.recent.columns.when',
    ]) {
      expect(keys).toContain(key)
    }
  })
})
