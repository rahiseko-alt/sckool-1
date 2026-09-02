import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../api'
import type { Session } from '../session'
import { card, errorText, hint, label, primaryButton, quietButton } from '../ui'

/**
 * テストを受けてボーナス MP をもらう（要件32、受け入れ基準 E3・E4・E5）。
 *
 * **採点はサーバーが行う。** 画面は答えを送って結果を受け取るだけで、
 * 正解を持たない。持たせると、開発者ツールを開くだけで満点を取れてしまう。
 */

interface QuizSummary {
  id: string
  title: string
  topic: string
  question_count: number
  max_reward: number
  bonus_valid_days: number
}

interface Question {
  id: string
  prompt: string
  choices: string[]
}

interface Result {
  score: number
  reward_amount: number
  already_rewarded: boolean
  bonus_expires_at?: string
}

export function QuizzesScreen(props: { session?: Session; onNeedLogin: () => void }) {
  const { t } = useTranslation()
  const [list, setList] = useState<QuizSummary[] | undefined>()
  const [open, setOpen] = useState<{ summary: QuizSummary; questions: Question[] } | undefined>()
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<Result | undefined>()
  const [errorKey, setErrorKey] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await api<{ quizzes: QuizSummary[] }>('GET', '/store/quizzes')
      if (!cancelled && response.ok && response.data) setList(response.data.quizzes)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const start = async (summary: QuizSummary) => {
    if (!props.session) {
      props.onNeedLogin()
      return
    }
    const response = await api<{ quiz: { questions: Question[] } }>(
      'GET',
      `/store/quizzes/${summary.id}`,
    )
    if (!response.ok || !response.data) {
      setErrorKey(response.errorKey ?? 'unknown')
      return
    }
    setAnswers({})
    setResult(undefined)
    setErrorKey(undefined)
    setOpen({ summary, questions: response.data.quiz.questions })
  }

  const submit = async () => {
    if (!open || !props.session) return
    setBusy(true)
    const response = await api<Result>('POST', `/store/quizzes/${open.summary.id}/submit`, {
      body: { answers },
      token: props.session.token,
    })
    setBusy(false)
    if (!response.ok || !response.data) {
      setErrorKey(response.errorKey ?? 'unknown')
      return
    }
    setResult(response.data)
  }

  if (result && open) {
    return (
      <div style={{ ...card, maxWidth: '520px' }}>
        <h1 style={{ fontSize: 'var(--text-h2)', marginTop: 0 }}>{t('quiz.resultTitle')}</h1>
        <div style={label}>{t('quiz.score')}</div>
        <div className="numeric" style={{ fontSize: 'var(--text-display)' }}>
          {result.score}
        </div>

        <p style={{ marginTop: 'var(--sp-4)' }}>
          {result.reward_amount > 0
            ? t('quiz.reward', { amount: result.reward_amount.toLocaleString() })
            : t('quiz.noReward')}
        </p>
        {/* 2回目以降は「すでに受け取り済み」と伝える。0と出すだけでは理由が分からない。 */}
        {result.already_rewarded && result.reward_amount === 0 && (
          <p style={hint}>{t('quiz.alreadyRewarded')}</p>
        )}
        {result.bonus_expires_at && (
          <p style={hint}>
            {t('quiz.expiresAt')}: {new Date(result.bonus_expires_at).toLocaleDateString()}
          </p>
        )}

        <button type="button" onClick={() => setOpen(undefined)} style={primaryButton}>
          {t('quiz.backToList')}
        </button>
      </div>
    )
  }

  if (open) {
    return (
      <div>
        <h1 style={{ fontSize: 'var(--text-h1)', marginTop: 0 }}>{open.summary.title}</h1>
        <p style={hint}>
          {t('quiz.topic')}: {open.summary.topic}
        </p>

        {open.questions.map((question, index) => (
          <fieldset
            key={question.id}
            style={{ ...card, marginTop: 'var(--sp-4)', border: '1px solid var(--border)' }}
          >
            <legend style={hint}>{t('quiz.question', { number: index + 1 })}</legend>
            <div style={{ fontWeight: 600 }}>{question.prompt}</div>
            {question.choices.map((choice, choiceIndex) => (
              <label
                key={choice}
                style={{ display: 'block', marginTop: 'var(--sp-2)', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name={question.id}
                  checked={answers[question.id] === choiceIndex}
                  onChange={() => setAnswers({ ...answers, [question.id]: choiceIndex })}
                />{' '}
                {choice}
              </label>
            ))}
          </fieldset>
        ))}

        {errorKey && <p style={errorText}>{t(`errors.${errorKey}`)}</p>}

        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-6)' }}>
          <button type="button" onClick={submit} disabled={busy} style={primaryButton}>
            {t('quiz.submit')}
          </button>
          <button type="button" onClick={() => setOpen(undefined)} style={quietButton}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('quiz.title')}</h1>
      <p style={hint}>{t('quiz.subtitle')}</p>

      {!props.session && <p style={hint}>{t('quiz.loginToTake')}</p>}
      {errorKey && <p style={errorText}>{t(`errors.${errorKey}`)}</p>}
      {list?.length === 0 && <p>{t('quiz.empty')}</p>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 'var(--sp-4)',
        }}
      >
        {(list ?? []).map((quiz) => (
          <article key={quiz.id} style={card}>
            <div style={{ fontWeight: 600 }}>{quiz.title}</div>
            <div style={hint}>
              {t('quiz.topic')}: {quiz.topic}
            </div>
            <div className="numeric" style={hint}>
              {t('quiz.questionCount', { count: quiz.question_count })}
            </div>
            <div className="numeric" style={{ marginTop: 'var(--sp-2)' }}>
              {t('quiz.reward', { amount: quiz.max_reward.toLocaleString() })}
            </div>
            <button
              type="button"
              onClick={() => start(quiz)}
              style={{ ...primaryButton, marginTop: 'var(--sp-3)', width: '100%' }}
            >
              {t('quiz.start')}
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
