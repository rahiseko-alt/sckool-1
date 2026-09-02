import { describe, expect, it } from 'vitest'

import {
  checkLock,
  LOCK_DURATION_MS,
  MAX_ATTEMPTS,
  recordFailure,
  recordSuccess,
  remainingMinutes,
  type AttemptRecord,
} from './guard'

const T0 = 1_000_000

/** 指定の回数だけ続けて失敗させる。 */
function failTimes(times: number, at = T0): AttemptRecord | undefined {
  let record: AttemptRecord | undefined
  for (let i = 0; i < times; i += 1) {
    record = recordFailure(record, at)
  }
  return record
}

describe('失敗の数え方（受け入れ基準 A6）', () => {
  it('はじめは止まっていない', () => {
    expect(checkLock(undefined, T0)).toEqual({
      locked: false,
      remainingMs: 0,
      attemptsLeft: MAX_ATTEMPTS,
    })
  })

  it('4回までは止まらない', () => {
    const state = checkLock(failTimes(MAX_ATTEMPTS - 1), T0)
    expect(state.locked).toBe(false)
    expect(state.attemptsLeft).toBe(1)
  })

  it('5回目で止まる', () => {
    const state = checkLock(failTimes(MAX_ATTEMPTS), T0)
    expect(state.locked).toBe(true)
    expect(state.attemptsLeft).toBe(0)
    expect(state.remainingMs).toBe(LOCK_DURATION_MS)
  })

  it('成功したら数えが0に戻る', () => {
    const afterFailures = failTimes(MAX_ATTEMPTS - 1)
    expect(checkLock(afterFailures, T0).attemptsLeft).toBe(1)
    expect(checkLock(recordSuccess(), T0).attemptsLeft).toBe(MAX_ATTEMPTS)
  })
})

describe('止まっている時間', () => {
  it('15分たつと解ける', () => {
    const locked = failTimes(MAX_ATTEMPTS)
    expect(checkLock(locked, T0 + LOCK_DURATION_MS - 1).locked).toBe(true)
    expect(checkLock(locked, T0 + LOCK_DURATION_MS).locked).toBe(false)
  })

  it('解けたあとは数えが最初に戻る', () => {
    const locked = failTimes(MAX_ATTEMPTS)
    expect(checkLock(locked, T0 + LOCK_DURATION_MS).attemptsLeft).toBe(MAX_ATTEMPTS)
  })

  it('解けたあとに失敗しても、すぐには止まらない', () => {
    const locked = failTimes(MAX_ATTEMPTS)
    const afterUnlock = recordFailure(locked, T0 + LOCK_DURATION_MS)
    expect(afterUnlock.failures).toBe(1)
    expect(checkLock(afterUnlock, T0 + LOCK_DURATION_MS).locked).toBe(false)
  })

  it('止まっている間に失敗しても、解ける時刻が延びる', () => {
    // 止められているのに叩き続けるのは総当たりなので、延ばすのが正しい。
    const locked = failTimes(MAX_ATTEMPTS)
    const later = recordFailure(locked, T0 + 60_000)
    expect(checkLock(later, T0 + 60_000).remainingMs).toBe(LOCK_DURATION_MS)
  })
})

describe('利用者に見せる分数', () => {
  it('1分未満でも「1分」と言う', () => {
    expect(remainingMinutes(1)).toBe(1)
    expect(remainingMinutes(59_000)).toBe(1)
  })

  it('切り上げる', () => {
    expect(remainingMinutes(61_000)).toBe(2)
    expect(remainingMinutes(LOCK_DURATION_MS)).toBe(15)
  })
})
