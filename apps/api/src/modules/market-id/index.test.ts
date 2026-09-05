import { describe, expect, it } from 'vitest'

import {
  ID_ALPHABET,
  anonymousEmail,
  generateMarketId,
  generateRecoveryCode,
  hashRecoveryCode,
  isMarketId,
  isRecoveryCode,
  normalizeCode,
  verifyRecoveryCode,
} from './index'

/** 1回や2回では偏りが見えないため、まとまった数で確かめる。 */
const SAMPLE_SIZE = 10_000

describe('Market ID の生成', () => {
  it('紛らわしい文字（0 O 1 I）が1つも入らない', () => {
    const confusing = /[01OI]/
    const offenders = Array.from({ length: SAMPLE_SIZE }, generateMarketId).filter((id) =>
      confusing.test(id.replace('MKT-', '')),
    )
    expect(offenders).toEqual([])
  })

  it('MKT-XXXX-XXXX の形になっている', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isMarketId(generateMarketId())).toBe(true)
    }
  })

  it('同じものが並ばない', () => {
    const ids = new Set(Array.from({ length: SAMPLE_SIZE }, generateMarketId))
    // 32^8 通りあるので、1万件で重複が出るなら乱数が壊れている。
    expect(ids.size).toBe(SAMPLE_SIZE)
  })

  it('形が違うものは Market ID と認めない', () => {
    expect(isMarketId('MKT-7F4K-29QX0')).toBe(false)
    expect(isMarketId('7F4K-29QX')).toBe(false)
    expect(isMarketId('MKT-7F4K-29Q0')).toBe(false)
    expect(isMarketId('')).toBe(false)
  })
})

describe('Recovery Code の生成', () => {
  it('紛らわしい文字が入らず、XXXX-XXXX-XXXX の形になっている', () => {
    for (let i = 0; i < 1_000; i += 1) {
      const code = generateRecoveryCode()
      expect(isRecoveryCode(code)).toBe(true)
      expect(code.replaceAll('-', '')).not.toMatch(/[01OI]/)
    }
  })

  it('Market ID より長い（当てにくくしてある）', () => {
    expect(generateRecoveryCode().replaceAll('-', '').length).toBeGreaterThan(
      generateMarketId().replace('MKT-', '').replaceAll('-', '').length,
    )
  })
})

describe('使う文字', () => {
  it('紛らわしい4文字を含まない', () => {
    expect(ID_ALPHABET).not.toMatch(/[01OI]/)
  })
})

describe('入力のゆらぎ', () => {
  it('小文字や区切りの有無を吸収する', () => {
    expect(normalizeCode(' 8ghd-x19p-k7qt ')).toBe('8GHDX19PK7QT')
    expect(normalizeCode('8GHDX19PK7QT')).toBe('8GHDX19PK7QT')
  })
})

describe('Recovery Code のハッシュ', () => {
  it('同じコードと同じ塩なら同じ結果になる', () => {
    const salt = Buffer.alloc(16, 7)
    expect(hashRecoveryCode('8GHD-X19P-K7QT', salt)).toBe(hashRecoveryCode('8GHD-X19P-K7QT', salt))
  })

  it('違うコードなら違う結果になる', () => {
    const salt = Buffer.alloc(16, 7)
    expect(hashRecoveryCode('8GHD-X19P-K7QT', salt)).not.toBe(
      hashRecoveryCode('8GHD-X19P-K7QU', salt),
    )
  })

  it('塩が違えば同じコードでも別の結果になる', () => {
    expect(hashRecoveryCode('8GHD-X19P-K7QT')).not.toBe(hashRecoveryCode('8GHD-X19P-K7QT'))
  })

  it('保存した形に元のコードがそのまま現れない', () => {
    const code = '8GHD-X19P-K7QT'
    expect(hashRecoveryCode(code)).not.toContain(code.replaceAll('-', ''))
  })

  it('正しいコードだけを受け入れる', () => {
    const code = generateRecoveryCode()
    const stored = hashRecoveryCode(code)
    expect(verifyRecoveryCode(code, stored)).toBe(true)
    expect(verifyRecoveryCode(code.toLowerCase(), stored)).toBe(true)
    expect(verifyRecoveryCode(code.replaceAll('-', ''), stored)).toBe(true)
    expect(verifyRecoveryCode(generateRecoveryCode(), stored)).toBe(false)
  })

  it('保存した形が壊れていても落ちない', () => {
    expect(verifyRecoveryCode('8GHD-X19P-K7QT', '')).toBe(false)
    expect(verifyRecoveryCode('8GHD-X19P-K7QT', 'saltだけ')).toBe(false)
    expect(verifyRecoveryCode('8GHD-X19P-K7QT', 'aa:bb')).toBe(false)
  })
})

describe('匿名のメールアドレス', () => {
  it('Market ID から機械的に作られ、検査が通す形になっている', () => {
    const id = generateMarketId()
    const email = anonymousEmail(id)
    expect(email).toBe(`${id}@anon.invalid`)
    // scripts/check-no-personal-data.mjs が許す形と同じであること。
    expect(email).toMatch(/^MKT-[A-Z0-9]{4}-[A-Z0-9]{4}@anon\.invalid$/)
  })
})
