import { describe, expect, it } from 'vitest'

import { checkName, isValidName, MAX_NAME_LENGTH, nameKey, normalizeName } from './name'

describe('企業名の整え方', () => {
  it('前後の空白を落とす', () => {
    expect(normalizeName('  NEKO DESIGN  ')).toBe('NEKO DESIGN')
  })

  it('途中の連続した空白を1つにまとめる', () => {
    expect(normalizeName('NEKO   DESIGN')).toBe('NEKO DESIGN')
  })
})

describe('企業名の重複判定', () => {
  it('大文字小文字の違いは同じ名前とみなす', () => {
    expect(nameKey('NEKO DESIGN')).toBe(nameKey('neko design'))
  })

  it('全角と半角の違いは同じ名前とみなす', () => {
    expect(nameKey('ＮＥＫＯ')).toBe(nameKey('NEKO'))
  })

  it('空白の入れ方の違いは同じ名前とみなす', () => {
    expect(nameKey(' NEKO  DESIGN ')).toBe(nameKey('NEKO DESIGN'))
  })

  it('別の名前は別のままにする', () => {
    expect(nameKey('NEKO DESIGN')).not.toBe(nameKey('NEKO STUDIO'))
  })
})

describe('使ってよい名前か（受け入れ基準 B1）', () => {
  it('普通の名前は通る', () => {
    expect(checkName('NEKO DESIGN')).toBeUndefined()
    expect(checkName('あおいスタジオ')).toBeUndefined()
    expect(checkName('工作室 42')).toBeUndefined()
  })

  it('空と空白だけは断る', () => {
    expect(checkName('')).toBe('empty')
    expect(checkName('   ')).toBe('empty')
  })

  it('40文字までは通り、41文字は断る', () => {
    expect(checkName('あ'.repeat(MAX_NAME_LENGTH))).toBeUndefined()
    expect(checkName('あ'.repeat(MAX_NAME_LENGTH + 1))).toBe('too_long')
  })

  it('記号だけの名前は断る（他社と見分けられない）', () => {
    expect(checkName('---')).toBe('no_visible_characters')
    expect(checkName('!!!')).toBe('no_visible_characters')
  })

  it('改行とタブは空白にまとめられるので断らない', () => {
    // 空白として扱えるものは normalizeName が1つの空白に直すため、表示は崩れない。
    expect(checkName('NEKO\nDESIGN')).toBeUndefined()
    expect(normalizeName('NEKO\tDESIGN')).toBe('NEKO DESIGN')
  })

  it('目に見えない文字が混ざる名前は断る', () => {
    // ゼロ幅スペース。空白として扱われないので残ってしまい、
    // 見た目が同じで中身が違う名前を作れる（なりすましに近いことができる）。
    expect(checkName('NEKO​DESIGN')).toBe('control_characters')
  })

  it('6言語のどれでも名前を付けられる', () => {
    for (const name of ['NEKO', 'ネコ', '猫设计', 'Thiết kế', 'ने डिजाइन', 'ออกแบบ']) {
      expect(isValidName(name)).toBe(true)
    }
  })
})
