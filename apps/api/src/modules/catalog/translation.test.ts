import { describe, expect, it } from 'vitest'

import {
  checkTranslations,
  normalizeTranslations,
  pickTranslation,
  type Translation,
} from './translation'

const LOCALES = ['ja-JP', 'en', 'zh-CN', 'vi-VN', 'ne-NP', 'th-TH']

const original = { title: 'ロゴ制作', description: 'SNS用のロゴを作ります' }
const english: Translation = {
  locale_code: 'en',
  title: 'Logo design',
  description: 'We design logos for social media',
}

describe('訳の選び方（受け入れ基準 I3）', () => {
  it('その言語の訳があれば訳を出す', () => {
    expect(pickTranslation(original, [english], 'en')).toEqual({
      title: 'Logo design',
      description: 'We design logos for social media',
      locale_code: 'en',
    })
  })

  it('訳が無ければ原文を出す', () => {
    // キーや空文字を出さない。原文が読めなくても、何も出ないよりは手がかりになる。
    expect(pickTranslation(original, [english], 'th-TH')).toEqual(original)
  })

  it('言語を選んでいなければ原文を出す', () => {
    expect(pickTranslation(original, [english], undefined)).toEqual(original)
  })

  it('訳が1件も無くても壊れない', () => {
    expect(pickTranslation(original, [], 'en')).toEqual(original)
  })

  it('地域が違っても言語が同じなら使う', () => {
    // ja-JP を選んでいる人に ja の訳を出す、のような取りこぼしを拾う。
    const japanese: Translation = { locale_code: 'ja', title: 'ロゴ', description: '説明' }
    expect(pickTranslation({ title: 'Logo', description: 'desc' }, [japanese], 'ja-JP')).toEqual({
      title: 'ロゴ',
      description: '説明',
      locale_code: 'ja',
    })
  })

  it('ぴったり合う訳を優先する', () => {
    const generic: Translation = { locale_code: 'zh', title: '通用', description: '通用' }
    const exact: Translation = { locale_code: 'zh-CN', title: '简体', description: '简体' }
    expect(pickTranslation(original, [generic, exact], 'zh-CN').title).toBe('简体')
  })

  it('片方だけ訳してあれば、空の側は原文を使う', () => {
    // 全部そろわないと出ない作りにすると、途中まで訳した労力が無駄になる。
    const half: Translation = { locale_code: 'en', title: 'Logo design', description: '  ' }
    expect(pickTranslation(original, [half], 'en')).toEqual({
      title: 'Logo design',
      description: original.description,
      locale_code: 'en',
    })
  })
})

describe('訳の入力の確かめ方', () => {
  it('訳を入れなくても問題にしない（任意だから）', () => {
    expect(checkTranslations(undefined, LOCALES)).toEqual([])
    expect(checkTranslations([], LOCALES)).toEqual([])
  })

  it('知らない言語は断る', () => {
    expect(checkTranslations([{ locale_code: 'xx', title: 'a' }], LOCALES)).toEqual([
      { locale_code: 'xx', problem: 'unknown_locale' },
    ])
  })

  it('長すぎる訳は断る', () => {
    expect(
      checkTranslations([{ locale_code: 'en', title: 'a'.repeat(81) }], LOCALES),
    ).toEqual([{ locale_code: 'en', problem: 'too_long' }])
  })

  it('正しい訳は通す', () => {
    expect(checkTranslations([english], LOCALES)).toEqual([])
  })
})

describe('保存する形にそろえる', () => {
  it('前後の空白を落とす', () => {
    expect(
      normalizeTranslations([{ locale_code: 'en', title: '  Logo  ', description: ' d ' }], LOCALES),
    ).toEqual([{ locale_code: 'en', title: 'Logo', description: 'd' }])
  })

  it('中身が空だけの訳は捨てる', () => {
    // 行を作っても画面に出るものが無い。
    expect(
      normalizeTranslations([{ locale_code: 'en', title: '  ', description: '' }], LOCALES),
    ).toEqual([])
  })

  it('同じ言語が2つ来たらあとの1つだけ残す', () => {
    const result = normalizeTranslations(
      [
        { locale_code: 'en', title: 'first', description: '' },
        { locale_code: 'en', title: 'second', description: '' },
      ],
      LOCALES,
    )
    expect(result).toEqual([{ locale_code: 'en', title: 'second', description: '' }])
  })

  it('知らない言語は捨てる', () => {
    expect(normalizeTranslations([{ locale_code: 'xx', title: 'a' }], LOCALES)).toEqual([])
  })

  it('配列でないものを渡されても壊れない', () => {
    expect(normalizeTranslations('だめ', LOCALES)).toEqual([])
    expect(normalizeTranslations(null, LOCALES)).toEqual([])
  })
})
