import { describe, expect, it } from 'vitest'

import {
  checkMarketSettings,
  MARKET_SETTING_DEFAULTS,
  mergeMarketSettings,
  normalizeMarketSettings,
} from './defaults'

describe('授業ごとに変えられる数字（要件の前書き）', () => {
  it('既定値は要件に書かれた数字と同じ', () => {
    expect(MARKET_SETTING_DEFAULTS).toEqual({
      initial_funds: 100_000,
      login_max_attempts: 5,
      login_lock_minutes: 15,
      mutual_trade_threshold: 30,
    })
  })

  it('正しい入力は問題なしとする', () => {
    expect(checkMarketSettings({ initial_funds: 50_000 })).toEqual([])
  })

  it('画面から来る文字列も数として受け取る', () => {
    expect(checkMarketSettings({ initial_funds: '50000' })).toEqual([])
    expect(normalizeMarketSettings({ initial_funds: '50000' })).toEqual({ initial_funds: 50_000 })
  })

  it('小数と数でないものは断る', () => {
    expect(checkMarketSettings({ initial_funds: 1.5 })[0]?.code).toBe('not_an_integer')
    expect(checkMarketSettings({ initial_funds: 'abc' })[0]?.code).toBe('not_an_integer')
    expect(checkMarketSettings({ initial_funds: null })[0]?.code).toBe('not_an_integer')
    expect(checkMarketSettings({ initial_funds: '' })[0]?.code).toBe('not_an_integer')
  })

  it('範囲の外は断る', () => {
    expect(checkMarketSettings({ initial_funds: 0 })[0]).toEqual({
      key: 'initial_funds',
      code: 'out_of_range',
      min: 1,
      max: 10_000_000,
    })
    expect(checkMarketSettings({ login_max_attempts: 0 })[0]?.code).toBe('out_of_range')
    expect(checkMarketSettings({ login_lock_minutes: 1_441 })[0]?.code).toBe('out_of_range')
    expect(checkMarketSettings({ mutual_trade_threshold: 101 })[0]?.code).toBe('out_of_range')
  })

  it('負の初期資金は断る', () => {
    expect(checkMarketSettings({ initial_funds: -1 })[0]?.code).toBe('out_of_range')
  })

  it('知らない名前は黙って捨てずに断る', () => {
    expect(checkMarketSettings({ nonsense: 1 })[0]).toEqual({ key: 'nonsense', code: 'unknown_key' })
  })

  it('保存が空なら既定値をそのまま使う', () => {
    expect(mergeMarketSettings(undefined)).toEqual(MARKET_SETTING_DEFAULTS)
    expect(mergeMarketSettings({})).toEqual(MARKET_SETTING_DEFAULTS)
  })

  it('保存された値だけを上書きする', () => {
    expect(mergeMarketSettings({ initial_funds: 20_000 })).toEqual({
      ...MARKET_SETTING_DEFAULTS,
      initial_funds: 20_000,
    })
  })

  it('壊れた値は既定値に戻す', () => {
    expect(mergeMarketSettings({ initial_funds: -5, login_max_attempts: 3 })).toEqual({
      ...MARKET_SETTING_DEFAULTS,
      login_max_attempts: 3,
    })
  })
})
