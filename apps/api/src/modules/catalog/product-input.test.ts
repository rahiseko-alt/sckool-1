import { describe, expect, it } from 'vitest'

import {
  checkAvailability,
  checkProductInput,
  MAX_QUANTITY,
  parseDate,
  REQUIRED_FIELDS,
  type ProductInput,
} from './product-input'

/** 通る入力。個々のテストは、ここから1つだけ壊して確かめる。 */
function validInput(over: Partial<ProductInput> = {}): ProductInput {
  return {
    title: 'ロゴ制作',
    description: 'SNS用のロゴを作ります',
    target_customer: 'SNSを始めたばかりの企業',
    problem_solved: '見た目が揃わず、覚えてもらえない',
    price: 2_500,
    available_quantity: 10,
    image_url: 'https://example.com/logo.png',
    sale_starts_at: '2026-09-01T00:00:00Z',
    sale_ends_at: '2026-09-30T00:00:00Z',
    ...over,
  }
}

describe('必須項目（受け入れ基準 C1）', () => {
  it('全部そろっていれば通る', () => {
    expect(checkProductInput(validInput())).toEqual([])
  })

  it('要件6の8項目すべてを必須にしている', () => {
    // 販売期間は開始と終了の2つに分けているので9つになる。
    expect(REQUIRED_FIELDS).toHaveLength(9)
  })

  it.each([
    'title',
    'description',
    'target_customer',
    'problem_solved',
    'image_url',
  ] as const)('%s が空だと、その項目を指して断る', (field) => {
    const problems = checkProductInput(validInput({ [field]: '' }))
    expect(problems).toContainEqual({ field, problem: 'missing' })
  })

  it('空白だけの入力も「無い」とみなす', () => {
    expect(checkProductInput(validInput({ title: '   ' }))).toContainEqual({
      field: 'title',
      problem: 'missing',
    })
  })

  it('問題は全部まとめて返す（何度も断られないように）', () => {
    const problems = checkProductInput({})
    expect(problems.length).toBeGreaterThanOrEqual(9)
  })

  it('長すぎる商品名は断る', () => {
    expect(checkProductInput(validInput({ title: 'あ'.repeat(81) }))).toContainEqual({
      field: 'title',
      problem: 'too_long',
    })
  })
})

describe('価格（受け入れ基準 C3）', () => {
  it('1MP以上の整数だけを通す', () => {
    expect(checkProductInput(validInput({ price: 1 }))).toEqual([])
  })

  it.each([0, -100, 1.5])('価格 %s は断る', (price) => {
    expect(checkProductInput(validInput({ price }))).toContainEqual({
      field: 'price',
      problem: 'not_a_positive_integer',
    })
  })

  it('文字列の数字は通さない', () => {
    expect(checkProductInput(validInput({ price: '2500' }))).toContainEqual({
      field: 'price',
      problem: 'not_a_positive_integer',
    })
  })

  it('価格が無いときは「無い」と言う（形が違うとは言わない）', () => {
    expect(checkProductInput(validInput({ price: undefined }))).toContainEqual({
      field: 'price',
      problem: 'missing',
    })
  })
})

describe('提供可能数', () => {
  it('1以上の整数だけを通す', () => {
    expect(checkProductInput(validInput({ available_quantity: 1 }))).toEqual([])
  })

  it('0は断る', () => {
    expect(checkProductInput(validInput({ available_quantity: 0 }))).toContainEqual({
      field: 'available_quantity',
      problem: 'not_a_positive_integer',
    })
  })

  it('多すぎる数は断る（桁の間違いで相場が壊れる）', () => {
    expect(checkProductInput(validInput({ available_quantity: MAX_QUANTITY + 1 }))).toContainEqual({
      field: 'available_quantity',
      problem: 'not_a_positive_integer',
    })
  })
})

describe('販売期間', () => {
  it('日付として読めないものは断る', () => {
    expect(checkProductInput(validInput({ sale_starts_at: 'きのう' }))).toContainEqual({
      field: 'sale_starts_at',
      problem: 'invalid_date',
    })
  })

  it('終了が開始より前なら断る', () => {
    expect(
      checkProductInput(
        validInput({ sale_starts_at: '2026-09-30T00:00:00Z', sale_ends_at: '2026-09-01T00:00:00Z' }),
      ),
    ).toContainEqual({ field: 'sale_ends_at', problem: 'ends_before_starts' })
  })

  it('開始と終了が同じ時刻でも断る（1秒も売れないため）', () => {
    expect(
      checkProductInput(
        validInput({ sale_starts_at: '2026-09-01T00:00:00Z', sale_ends_at: '2026-09-01T00:00:00Z' }),
      ),
    ).toContainEqual({ field: 'sale_ends_at', problem: 'ends_before_starts' })
  })

  it('日付として読めるかを判定できる', () => {
    expect(parseDate('2026-09-01T00:00:00Z')).toBeInstanceOf(Date)
    expect(parseDate('きのう')).toBeUndefined()
    expect(parseDate('')).toBeUndefined()
    expect(parseDate(123)).toBeUndefined()
  })
})

describe('いま買えるか（受け入れ基準 C2）', () => {
  const product = {
    sale_starts_at: new Date('2026-09-01T00:00:00Z'),
    sale_ends_at: new Date('2026-09-30T00:00:00Z'),
    available_quantity: 5,
  }

  it('期間の中で在庫があれば買える', () => {
    expect(checkAvailability(product, new Date('2026-09-15T00:00:00Z'))).toBeUndefined()
  })

  it('始まる前は買えない', () => {
    expect(checkAvailability(product, new Date('2026-08-31T23:59:59Z'))).toBe('not_started')
  })

  it('終わったあとは買えない', () => {
    expect(checkAvailability(product, new Date('2026-10-01T00:00:00Z'))).toBe('ended')
  })

  it('在庫が0なら期間の中でも買えない', () => {
    expect(
      checkAvailability({ ...product, available_quantity: 0 }, new Date('2026-09-15T00:00:00Z')),
    ).toBe('sold_out')
  })

  it('売り切れは期間より先に伝える（在庫0で期間外なら「売り切れ」）', () => {
    // 「期間が終わった」と言われると、次の期間を待てば買えると誤解する。
    expect(
      checkAvailability({ ...product, available_quantity: 0 }, new Date('2026-10-01T00:00:00Z')),
    ).toBe('sold_out')
  })
})
