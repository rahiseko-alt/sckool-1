import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { LOCALES } from './locales'

const here = dirname(fileURLToPath(import.meta.url))
const load = (locale: string) =>
  JSON.parse(readFileSync(join(here, `${locale}.json`), 'utf8')) as {
    terms?: Record<string, string>
    purchaseLog?: { title?: string }
  }

/**
 * 呼び名の差し替え（受け入れ基準 J2）。
 *
 * **内部の名称は Participant / Organization / Administrator にそろえる。**
 * 画面に出る「生徒」「先生」は辞書の1語だけを書き換えれば変えられること。
 * 各画面に直接書くと、呼び方を変えたい先生が全画面を直す羽目になる。
 */
describe('管理画面の呼び名', () => {
  it('6言語すべてに呼び名がある', () => {
    for (const locale of LOCALES) {
      const dictionary = load(locale.code)
      expect(dictionary.terms?.participant, locale.code).toBeTruthy()
      expect(dictionary.terms?.organization, locale.code).toBeTruthy()
      expect(dictionary.terms?.administrator, locale.code).toBeTruthy()
    }
  })

  it('画面の文言は呼び名を参照している', () => {
    expect(load('ja-JP').purchaseLog?.title).toContain('$t(terms.administrator)')
  })

  it('呼び名そのもの以外に「生徒」「先生」を直接書いていない', () => {
    for (const locale of LOCALES) {
      const dictionary = load(locale.code)
      const withoutTerms = { ...dictionary, terms: undefined }
      const text = JSON.stringify(withoutTerms)
      expect(text, locale.code).not.toContain('生徒')
      expect(text, locale.code).not.toContain('先生')
    }
  })
})
