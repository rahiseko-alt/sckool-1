import { describe, expect, it } from 'vitest'

import {
  checkQuizTranslations,
  normalizeQuizTranslations,
  pickQuizTranslation,
  type QuizOriginal,
  type QuizTranslation,
} from './translation'

const original: QuizOriginal = {
  title: 'Knowledge Challenge',
  topic: '独占禁止法',
  questions: [
    { id: 'q0', prompt: 'カルテルとは？', choices: ['値段の取り決め', '値引き', '広告'] },
    { id: 'q1', prompt: '循環取引とは？', choices: ['ぐるぐる買い合う', '普通の売買'] },
  ],
}

const allowed = ['en', 'ne-NP', 'th-TH', 'zh-CN', 'vi-VN', 'ja-JP']

const enFull: QuizTranslation = {
  locale_code: 'en',
  title: 'Knowledge Challenge',
  topic: 'Antitrust law',
  questions: [
    { id: 'q0', prompt: 'What is a cartel?', choices: ['Price fixing', 'Discount', 'Advertising'] },
    { id: 'q1', prompt: 'What is circular trading?', choices: ['Buying in a loop', 'Normal trade'] },
  ],
}

describe('テスト翻訳の選択', () => {
  it('言語が無ければ原文', () => {
    expect(pickQuizTranslation(original, [enFull], undefined)).toMatchObject({
      title: 'Knowledge Challenge',
      topic: '独占禁止法',
    })
  })

  it('訳のある言語ではその訳を出す', () => {
    const d = pickQuizTranslation(original, [enFull], 'en')
    expect(d.topic).toBe('Antitrust law')
    expect(d.questions[0].prompt).toBe('What is a cartel?')
    expect(d.questions[0].choices).toEqual(['Price fixing', 'Discount', 'Advertising'])
    expect(d.locale_code).toBe('en')
  })

  it('訳の無い言語では原文にフォールバック', () => {
    const d = pickQuizTranslation(original, [enFull], 'th-TH')
    expect(d.topic).toBe('独占禁止法')
    expect(d.locale_code).toBeUndefined()
  })

  it('地域違い（en を選び en-US の訳）でも拾う', () => {
    const d = pickQuizTranslation(original, [{ ...enFull, locale_code: 'en' }], 'en-US')
    expect(d.topic).toBe('Antitrust law')
  })

  it('一部だけの訳は、空の側を原文で埋める', () => {
    const partial: QuizTranslation = {
      locale_code: 'en',
      topic: 'Antitrust law',
      questions: [{ id: 'q0', prompt: '', choices: [] }],
    }
    const d = pickQuizTranslation(original, [partial], 'en')
    expect(d.topic).toBe('Antitrust law')
    expect(d.title).toBe('Knowledge Challenge') // 原文のまま
    expect(d.questions[0].prompt).toBe('カルテルとは？') // 原文のまま
  })

  it('選択肢の数が原文と違う訳は使わない（正解の位置がずれるため）', () => {
    const wrong: QuizTranslation = {
      locale_code: 'en',
      questions: [{ id: 'q0', prompt: 'What is a cartel?', choices: ['only one'] }],
    }
    const d = pickQuizTranslation(original, [wrong], 'en')
    expect(d.questions[0].prompt).toBe('What is a cartel?') // 設問文は訳す
    expect(d.questions[0].choices).toEqual(['値段の取り決め', '値引き', '広告']) // 選択肢は原文
  })
})

describe('テスト翻訳の検査', () => {
  it('正しい訳は問題なし', () => {
    expect(checkQuizTranslations([enFull], original, allowed)).toEqual([])
  })

  it('知らない言語は弾く', () => {
    const p = checkQuizTranslations([{ locale_code: 'xx', title: 'x' }], original, allowed)
    expect(p).toEqual([{ locale_code: 'xx', code: 'unknown_locale' }])
  })

  it('選択肢の数が違うと弾く', () => {
    const p = checkQuizTranslations(
      [{ locale_code: 'en', questions: [{ id: 'q0', prompt: 'x', choices: ['a', 'b'] }] }],
      original,
      allowed,
    )
    expect(p).toContainEqual({ locale_code: 'en', code: 'choices_count_mismatch', question_id: 'q0' })
  })

  it('原文に無い設問 id は弾く', () => {
    const p = checkQuizTranslations(
      [{ locale_code: 'en', questions: [{ id: 'q9', prompt: 'x', choices: [] }] }],
      original,
      allowed,
    )
    expect(p).toContainEqual({ locale_code: 'en', code: 'unknown_question', question_id: 'q9' })
  })
})

describe('テスト翻訳の正規化', () => {
  it('中身が空の言語は捨てる', () => {
    const n = normalizeQuizTranslations([{ locale_code: 'en', title: '', topic: '', questions: [] }], original, allowed)
    expect(n).toEqual([])
  })

  it('数の合わない選択肢は落とし、設問文だけ残す', () => {
    const n = normalizeQuizTranslations(
      [{ locale_code: 'en', questions: [{ id: 'q0', prompt: 'What is a cartel?', choices: ['a'] }] }],
      original,
      allowed,
    )
    expect(n[0].questions[0]).toEqual({ id: 'q0', prompt: 'What is a cartel?', choices: [] })
  })

  it('正しい訳はそのまま残る', () => {
    const n = normalizeQuizTranslations([enFull], original, allowed)
    expect(n[0].locale_code).toBe('en')
    expect(n[0].questions[0].choices).toEqual(['Price fixing', 'Discount', 'Advertising'])
  })
})
