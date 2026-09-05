import { describe, expect, it } from 'vitest'

import { errorKeyOf } from './api'

describe('サーバーの合図を辞書のキーに直す（受け入れ基準 I2）', () => {
  it('知っている合図はそのままキーになる', () => {
    expect(errorKeyOf(402, 'insufficient_balance')).toBe('insufficient_balance')
    expect(errorKeyOf(400, 'cannot_buy_own_listing')).toBe('cannot_buy_own_listing')
    expect(errorKeyOf(409, 'listing_unavailable')).toBe('listing_unavailable')
  })

  it('ログインの失敗は同じ文言にする', () => {
    // ID が無いのかパスワードが違うのかを分けない（受け入れ基準 A2）。
    expect(errorKeyOf(401, 'invalid_credentials')).toBe('invalid_login')
    expect(errorKeyOf(401, undefined)).toBe('invalid_login')
  })

  it('知らない合図はそのまま画面に出さない', () => {
    // 内部の名前が出ても生徒には読めないし、何を直せばよいかも伝わらない。
    expect(errorKeyOf(500, 'some_internal_thing')).toBe('unknown')
    expect(errorKeyOf(400, undefined)).toBe('unknown')
    expect(errorKeyOf(0, null)).toBe('unknown')
  })
})
