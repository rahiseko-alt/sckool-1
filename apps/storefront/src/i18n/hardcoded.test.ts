import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { findHardcodedJapanese } from './hardcoded'

describe('直接書かれた日本語を見つける', () => {
  it('画面に出る文字列を見つける', () => {
    const found = findHardcodedJapanese('const label = "購入する"')
    expect(found).toEqual([{ line: 1, text: 'const label = "購入する"' }])
  })

  it('1行コメントの日本語は問題にしない', () => {
    // 「なぜそうしたか」は日本語で書く決まりにしてある。
    expect(findHardcodedJapanese('const a = 1 // 理由を書く')).toEqual([])
  })

  it('ブロックコメントの日本語も問題にしない', () => {
    const source = ['/**', ' * 説明を書く。', ' */', 'const a = 1'].join('\n')
    expect(findHardcodedJapanese(source)).toEqual([])
  })

  it('1行の途中で閉じるブロックコメントも読み飛ばす', () => {
    expect(findHardcodedJapanese('const a = /* 説明 */ 1')).toEqual([])
  })

  it('コメントが終わったあとの日本語は見つける', () => {
    const source = ['/* 説明 */ const label = "買う"'].join('\n')
    expect(findHardcodedJapanese(source)).toHaveLength(1)
  })

  it('見逃したい行は allow に書ける', () => {
    expect(findHardcodedJapanese('const unit = "円" // eslint', ['const unit'])).toEqual([])
  })

  it('日本語が無ければ何も出ない', () => {
    expect(findHardcodedJapanese('const label = t("market.buy")')).toEqual([])
  })
})

/** 画面のコードを全部集める。 */
function screenFiles(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      // 辞書そのものは日本語で書く場所なので見ない。
      if (name === 'i18n') continue
      found.push(...screenFiles(path))
      continue
    }
    if (name.endsWith('.tsx') || (name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
      found.push(path)
    }
  }
  return found
}

describe('生徒が見る画面（受け入れ基準 I2）', () => {
  const srcDir = dirname(dirname(fileURLToPath(import.meta.url)))

  it('画面のコードに日本語を直接書いていない', () => {
    // 1つでも直接書くと、その行だけ切り替わらないまま残る。
    // 日本語で見ている限り、動かしても気づけない。
    const offenders = screenFiles(srcDir).flatMap((path) => {
      const found = findHardcodedJapanese(readFileSync(path, 'utf8'))
      return found.map((one) => `${path.slice(srcDir.length + 1)}:${one.line} ${one.text}`)
    })
    expect(offenders).toEqual([])
  })
})
