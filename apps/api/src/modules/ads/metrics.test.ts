import { describe, expect, it } from 'vitest'

import { calculateMetrics, isActive, priceFor, sumMetrics, DEFAULT_DAILY_RATE } from './metrics'

describe('広告の数字（受け入れ基準 F2）', () => {
  it('表示・クリック・購入をそのまま数える', () => {
    const metrics = calculateMetrics(
      { impressions: 100, clicks: 10, conversions: 2, revenue: 5_000 },
      1_000,
    )
    expect(metrics.impressions).toBe(100)
    expect(metrics.clicks).toBe(10)
    expect(metrics.conversions).toBe(2)
  })

  it('CTR は クリック ÷ 表示', () => {
    expect(
      calculateMetrics({ impressions: 100, clicks: 10, conversions: 0, revenue: 0 }, 0).ctr,
    ).toBe(0.1)
  })

  it('ROAS は 売上 ÷ 広告費', () => {
    expect(
      calculateMetrics({ impressions: 0, clicks: 0, conversions: 1, revenue: 5_000 }, 1_000).roas,
    ).toBe(5)
  })

  it('表示が0でも壊れない（NaN を画面に出さない）', () => {
    const metrics = calculateMetrics({ impressions: 0, clicks: 0, conversions: 0, revenue: 0 }, 0)
    expect(metrics.ctr).toBe(0)
    expect(metrics.roas).toBe(0)
    expect(Number.isFinite(metrics.ctr)).toBe(true)
    expect(Number.isFinite(metrics.roas)).toBe(true)
  })

  it('広告費が0で売上があっても Infinity にしない', () => {
    expect(
      calculateMetrics({ impressions: 1, clicks: 1, conversions: 1, revenue: 5_000 }, 0).roas,
    ).toBe(0)
  })

  it('CTR は小数第3位まで', () => {
    expect(
      calculateMetrics({ impressions: 3, clicks: 1, conversions: 0, revenue: 0 }, 0).ctr,
    ).toBe(0.333)
  })
})

describe('複数の広告をまとめる', () => {
  it('合計してから割り算する', () => {
    const total = sumMetrics([
      calculateMetrics({ impressions: 100, clicks: 10, conversions: 1, revenue: 2_000 }, 1_000),
      calculateMetrics({ impressions: 100, clicks: 30, conversions: 3, revenue: 6_000 }, 1_000),
    ])

    expect(total.impressions).toBe(200)
    expect(total.clicks).toBe(40)
    // 個々の CTR（0.1 と 0.3）の平均ではなく、合計から出す。
    expect(total.ctr).toBe(0.2)
    expect(total.spend).toBe(2_000)
    expect(total.roas).toBe(4)
  })

  it('1つも無ければ全て0', () => {
    const total = sumMetrics([])
    expect(total).toEqual({
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      spend: 0,
      revenue: 0,
      roas: 0,
    })
  })
})

describe('広告が出ている期間', () => {
  const placement = {
    starts_at: new Date('2026-09-01T00:00:00Z'),
    ends_at: new Date('2026-09-08T00:00:00Z'),
  }

  it('期間の中なら出ている', () => {
    expect(isActive(placement, new Date('2026-09-05T00:00:00Z'))).toBe(true)
  })

  it('始まる前と終わったあとは出ていない', () => {
    expect(isActive(placement, new Date('2026-08-31T23:59:59Z'))).toBe(false)
    expect(isActive(placement, new Date('2026-09-08T00:00:01Z'))).toBe(false)
  })
})

describe('広告枠の値段（受け入れ基準 F1）', () => {
  it('日数に比例する', () => {
    expect(priceFor(1)).toBe(DEFAULT_DAILY_RATE)
    expect(priceFor(7)).toBe(DEFAULT_DAILY_RATE * 7)
  })

  it('単価を変えられる', () => {
    expect(priceFor(3, 200)).toBe(600)
  })

  it('0日や小数の日数は断る', () => {
    expect(priceFor(0)).toBeUndefined()
    expect(priceFor(-1)).toBeUndefined()
    expect(priceFor(1.5)).toBeUndefined()
  })
})
