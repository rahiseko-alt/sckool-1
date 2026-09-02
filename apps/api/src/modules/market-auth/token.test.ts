import { describe, expect, it } from 'vitest'

import { marketIdFromPayload, marketIdOf, readBearer } from './token'

describe('合鍵の取り出し', () => {
  it('Bearer の後ろを取り出す', () => {
    expect(readBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('大文字小文字と前後の空白を気にしない', () => {
    expect(readBearer('  bearer   abc  ')).toBe('abc')
  })

  it('Bearer が無ければ受け取らない', () => {
    expect(readBearer('abc')).toBeUndefined()
    expect(readBearer('Basic abc')).toBeUndefined()
    expect(readBearer(undefined)).toBeUndefined()
    expect(readBearer(123)).toBeUndefined()
  })
})

describe('合鍵から企業を読む', () => {
  const payload = {
    actor_type: 'customer',
    app_metadata: { market_id: 'MKT-ABCD-2345' },
  }

  it('生徒の合鍵から Market ID を読む', () => {
    expect(marketIdFromPayload(payload)).toBe('MKT-ABCD-2345')
  })

  it('小文字で入っていても大文字に揃える', () => {
    expect(
      marketIdFromPayload({ actor_type: 'customer', app_metadata: { market_id: 'mkt-abcd-2345' } }),
    ).toBe('MKT-ABCD-2345')
  })

  it('運営者の合鍵では企業として扱わない', () => {
    // 運営者が生徒の画面を操作できると、履歴から「誰がやったか」が分からなくなる。
    expect(
      marketIdFromPayload({ actor_type: 'user', app_metadata: { market_id: 'MKT-ABCD-2345' } }),
    ).toBeUndefined()
  })

  it('Market ID が入っていなければ受け取らない', () => {
    expect(marketIdFromPayload({ actor_type: 'customer', app_metadata: {} })).toBeUndefined()
    expect(marketIdFromPayload({ actor_type: 'customer' })).toBeUndefined()
    expect(
      marketIdFromPayload({ actor_type: 'customer', app_metadata: { market_id: '   ' } }),
    ).toBeUndefined()
    expect(
      marketIdFromPayload({ actor_type: 'customer', app_metadata: { market_id: 42 } }),
    ).toBeUndefined()
  })

  it('中身が無い・形が違うものは受け取らない', () => {
    expect(marketIdFromPayload(null)).toBeUndefined()
    expect(marketIdFromPayload('abc')).toBeUndefined()
    expect(marketIdFromPayload(undefined)).toBeUndefined()
  })
})

describe('経路から「いまの企業」を読む', () => {
  it('middleware が入れた値を読む', () => {
    expect(marketIdOf({ market_id: 'MKT-ABCD-2345' })).toBe('MKT-ABCD-2345')
  })

  it('入っていなければ空になる（経路は空を拒む）', () => {
    expect(marketIdOf({})).toBe('')
    expect(marketIdOf(null)).toBe('')
    // 本文に入れられた値は読まない。読むと、この仕組み全体が意味を失う。
    expect(marketIdOf({ body: { market_id: 'MKT-ZZZZ-ZZZZ' } })).toBe('')
  })
})
