import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageShell } from '../../components/page-shell'
import { adminI18n } from '../../i18n'

/**
 * 授業ごとに変えられる数字の画面（`docs/requirements.md` 第2部の前書き、
 * 受け入れ基準 A6・B2・E5・H2）。
 *
 * 要件は「**既定値**と書いたものは管理者が画面から変更できるようにする」と決めている。
 * 変えられるのは4つの数字と、テストごとの「得点 → ボーナス」の換算表。
 *
 * **既定値はサーバー側のコードが持ち続ける。** ここで保存するのは差分だけで、
 * 「すべて既定値に戻す」を押せば保存を消して元の数字に戻る。
 *
 * 文字列は辞書から引く（要件34、受け入れ基準 I1・J2）。
 */

declare const __BACKEND_URL__: string

const ALERT = '#b91c1c'
const OK = '#15803d'
const BORDER = '1px solid rgba(0, 0, 0, 0.12)'

/** サーバーが返す数字の名前。`apps/api/src/modules/market-settings/defaults.ts` と同じ綴り。 */
type SettingKey =
  | 'initial_funds'
  | 'login_max_attempts'
  | 'login_lock_minutes'
  | 'mutual_trade_threshold'

interface SettingsResponse {
  settings: Record<SettingKey, number>
  defaults: Record<SettingKey, number>
  ranges: Record<SettingKey, { min: number; max: number }>
  stored: Partial<Record<SettingKey, number>>
}

interface SettingProblem {
  key: string
  code: 'unknown_key' | 'not_an_integer' | 'out_of_range'
  min?: number
  max?: number
}

interface RewardTier {
  minScore: number
  amount: number
}

interface AdminQuiz {
  id: string
  title: string
  topic: string
  question_count: number
  reward_tiers: RewardTier[]
  bonus_valid_days: number
  is_open: boolean
}

interface TierProblem {
  code:
    | 'not_a_list'
    | 'empty'
    | 'not_an_object'
    | 'score_out_of_range'
    | 'amount_negative'
    | 'missing_zero'
    | 'duplicate_score'
    | 'not_monotonic'
  value?: number
}

/** 画面に並べる順。名前と説明はどちらも辞書から引く。 */
const FIELDS: { key: SettingKey; name: string }[] = [
  { key: 'initial_funds', name: 'initialFunds' },
  { key: 'login_max_attempts', name: 'loginMaxAttempts' },
  { key: 'login_lock_minutes', name: 'loginLockMinutes' },
  { key: 'mutual_trade_threshold', name: 'mutualTradeThreshold' },
]

const input: React.CSSProperties = {
  padding: '10px 12px',
  border: BORDER,
  borderRadius: '6px',
  fontSize: '16px',
  width: '160px',
  fontVariantNumeric: 'tabular-nums',
}

const button: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '6px',
  border: 'none',
  background: '#2563eb',
  color: '#ffffff',
  fontSize: '15px',
  cursor: 'pointer',
}

const quietButton: React.CSSProperties = {
  ...button,
  background: '#ffffff',
  color: '#111827',
  border: BORDER,
}

const cell: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
}

const headCell: React.CSSProperties = { ...cell, textAlign: 'left', fontWeight: 400, opacity: 0.7 }

/**
 * 画面に残す知らせは**訳した文ではなく辞書の鍵で持つ**。
 *
 * 訳した文をそのまま持つと、あとから言語を切り替えても前の言語のまま残る
 * （実際にブラウザで確かめて見つけた）。断られた理由も同じ理由で符号のまま持つ。
 */
interface Message {
  key: string
  params?: Record<string, string | number>
}

const MarketSettingsPage = () => {
  const { t } = useTranslation()

  const [data, setData] = useState<SettingsResponse | undefined>()
  const [draft, setDraft] = useState<Record<SettingKey, string> | undefined>()
  const [error, setError] = useState<Message | undefined>()
  const [problems, setProblems] = useState<SettingProblem[]>([])
  const [notice, setNotice] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([])
  const [quizDraft, setQuizDraft] = useState<Record<string, AdminQuiz>>({})
  const [quizProblems, setQuizProblems] = useState<Record<string, TierProblem[]>>({})
  const [quizSaved, setQuizSaved] = useState<Record<string, boolean>>({})

  /** 応答の中身を画面の入力欄に写す。保存のあとも同じ処理で書き戻す。 */
  const adopt = useCallback((body: SettingsResponse) => {
    setData(body)
    setDraft({
      initial_funds: String(body.settings.initial_funds),
      login_max_attempts: String(body.settings.login_max_attempts),
      login_lock_minutes: String(body.settings.login_lock_minutes),
      mutual_trade_threshold: String(body.settings.mutual_trade_threshold),
    })
  }, [])

  const readError = useCallback(
    (status: number): Message =>
      status === 401
        ? { key: 'error.unauthorized' }
        : { key: 'error.load', params: { status } },
    [],
  )

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [settings, quizList] = await Promise.all([
          fetch(`${__BACKEND_URL__}/admin/market-settings`, { credentials: 'include' }),
          fetch(`${__BACKEND_URL__}/admin/quizzes`, { credentials: 'include' }),
        ])
        if (cancelled) return

        if (!settings.ok) {
          setError(readError(settings.status))
          return
        }
        setError(undefined)
        adopt((await settings.json()) as SettingsResponse)

        if (quizList.ok) {
          const body = (await quizList.json()) as { quizzes: AdminQuiz[] }
          setQuizzes(body.quizzes)
          setQuizDraft(Object.fromEntries(body.quizzes.map((quiz) => [quiz.id, quiz])))
        }
      } catch {
        if (!cancelled) setError({ key: 'error.offline' })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [adopt, readError])

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setNotice(undefined)
    try {
      const response = await fetch(`${__BACKEND_URL__}/admin/market-settings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings: draft }),
      })

      if (response.status === 400) {
        const body = (await response.json()) as { problems?: SettingProblem[] }
        setProblems(body.problems ?? [])
        return
      }
      if (!response.ok) {
        setError(readError(response.status))
        return
      }

      setProblems([])
      adopt((await response.json()) as SettingsResponse)
      setNotice('marketSettings.saved')
    } catch {
      setError({ key: 'error.offline' })
    } finally {
      setBusy(false)
    }
  }

  const resetAll = async () => {
    setBusy(true)
    setNotice(undefined)
    try {
      const response = await fetch(`${__BACKEND_URL__}/admin/market-settings`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        setError(readError(response.status))
        return
      }
      setProblems([])
      adopt((await response.json()) as SettingsResponse)
      setNotice('marketSettings.resetDone')
    } catch {
      setError({ key: 'error.offline' })
    } finally {
      setBusy(false)
    }
  }

  const saveQuiz = async (quiz: AdminQuiz) => {
    setQuizSaved((current) => ({ ...current, [quiz.id]: false }))
    try {
      const response = await fetch(`${__BACKEND_URL__}/admin/quizzes/${quiz.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reward_tiers: quiz.reward_tiers,
          bonus_valid_days: quiz.bonus_valid_days,
          is_open: quiz.is_open,
        }),
      })

      if (response.status === 400) {
        const body = (await response.json()) as { code?: string; problems?: TierProblem[] }
        setQuizProblems((current) => ({
          ...current,
          [quiz.id]:
            body.code === 'invalid_bonus_valid_days'
              ? [{ code: 'not_a_list' }]
              : (body.problems ?? []),
        }))
        return
      }
      if (!response.ok) {
        setError(readError(response.status))
        return
      }

      const body = (await response.json()) as { quiz: AdminQuiz }
      setQuizProblems((current) => ({ ...current, [quiz.id]: [] }))
      setQuizDraft((current) => ({ ...current, [quiz.id]: body.quiz }))
      setQuizzes((current) => current.map((row) => (row.id === quiz.id ? body.quiz : row)))
      setQuizSaved((current) => ({ ...current, [quiz.id]: true }))
    } catch {
      setError({ key: 'error.offline' })
    }
  }

  const editQuiz = (id: string, change: (quiz: AdminQuiz) => AdminQuiz) =>
    setQuizDraft((current) => {
      const quiz = current[id]
      return quiz ? { ...current, [id]: change(quiz) } : current
    })

  const settingProblemText = (problem: SettingProblem) => {
    const field = FIELDS.find((row) => row.key === problem.key)
    const name = field
      ? t(`marketSettings.fields.${field.name}.label`)
      : t('marketSettings.unknownField')

    if (problem.code === 'out_of_range') {
      return t('marketSettings.problem.outOfRange', {
        field: name,
        min: problem.min,
        max: problem.max,
      })
    }
    if (problem.code === 'unknown_key') {
      return t('marketSettings.problem.unknownKey', { field: problem.key })
    }
    return t('marketSettings.problem.notAnInteger', { field: name })
  }

  const tierProblemText = (problem: TierProblem) => {
    const value = problem.value ?? '?'
    switch (problem.code) {
      case 'empty':
        return t('marketSettings.quizzes.problem.empty')
      case 'score_out_of_range':
        return t('marketSettings.quizzes.problem.scoreOutOfRange', { value })
      case 'amount_negative':
        return t('marketSettings.quizzes.problem.amountNegative', { value })
      case 'missing_zero':
        return t('marketSettings.quizzes.problem.missingZero')
      case 'duplicate_score':
        return t('marketSettings.quizzes.problem.duplicateScore', { value })
      case 'not_monotonic':
        return t('marketSettings.quizzes.problem.notMonotonic')
      default:
        return t('marketSettings.quizzes.problem.notAList')
    }
  }

  return (
    <>
      {/* 間の空白は JSX 側で入れる。日本語以外は語の間に空白が要るので、
          辞書の文字列の端に持たせると（見えないので）消える。 */}
      <p style={{ opacity: 0.7, marginTop: '8px' }}>
        {t('marketSettings.lead')} <strong>{t('marketSettings.notice')}</strong>{' '}
        {t('marketSettings.detail')}
      </p>

      {error && <p style={{ color: ALERT }}>{t(error.key, error.params)}</p>}

      {data && draft && (
        <div data-testid="market-settings-form" style={{ marginTop: '24px' }}>
          <div style={{ display: 'grid', gap: '24px' }}>
            {FIELDS.map((field) => (
              <label key={field.key} style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontWeight: 600 }}>
                  {t(`marketSettings.fields.${field.name}.label`)}
                </span>
                <span style={{ opacity: 0.7 }}>
                  {t(`marketSettings.fields.${field.name}.help`)}
                </span>
                <input
                  name={field.key}
                  aria-label={t(`marketSettings.fields.${field.name}.label`)}
                  value={draft[field.key]}
                  inputMode="numeric"
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, [field.key]: event.target.value } : current,
                    )
                  }
                  style={input}
                />
                <span style={{ opacity: 0.7, fontSize: '13px' }}>
                  {t('marketSettings.defaultHint', {
                    value: data.defaults[field.key].toLocaleString(),
                  })}
                  {' / '}
                  {t('marketSettings.rangeHint', {
                    min: data.ranges[field.key].min.toLocaleString(),
                    max: data.ranges[field.key].max.toLocaleString(),
                  })}
                </span>
              </label>
            ))}
          </div>

          {problems.length > 0 && (
            <ul style={{ color: ALERT, marginTop: '16px' }} data-testid="market-settings-problems">
              {problems.map((problem) => (
                <li key={`${problem.key}-${problem.code}`}>{settingProblemText(problem)}</li>
              ))}
            </ul>
          )}

          {notice && (
            <p style={{ color: OK }} data-testid="market-settings-notice">
              {t(notice)}
            </p>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              style={{ ...button, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? t('marketSettings.saving') : t('marketSettings.save')}
            </button>
            <button type="button" onClick={() => void resetAll()} disabled={busy} style={quietButton}>
              {t('marketSettings.reset')}
            </button>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '18px', marginTop: '40px' }}>{t('marketSettings.quizzes.title')}</h2>
      <p style={{ opacity: 0.7 }}>{t('marketSettings.quizzes.lead')}</p>

      {quizzes.length === 0 && <p style={{ opacity: 0.7 }}>{t('marketSettings.quizzes.empty')}</p>}

      {quizzes.map((quiz) => {
        const editing = quizDraft[quiz.id] ?? quiz
        const found = quizProblems[quiz.id] ?? []
        const saved = quizSaved[quiz.id] === true

        return (
          <div
            key={quiz.id}
            data-testid="quiz-card"
            style={{ border: BORDER, borderRadius: '8px', padding: '20px', marginTop: '16px' }}
          >
            <h3 style={{ margin: 0, fontSize: '16px' }}>{quiz.title}</h3>
            <p style={{ opacity: 0.7, marginTop: '4px' }}>
              {t('marketSettings.quizzes.topic')}: {quiz.topic} /{' '}
              {t('marketSettings.quizzes.questionCount', { questions: quiz.question_count })} /{' '}
              {editing.is_open
                ? t('marketSettings.quizzes.open')
                : t('marketSettings.quizzes.closed')}
            </p>

            <table style={{ borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={headCell}>{t('marketSettings.quizzes.columns.minScore')}</th>
                  <th style={headCell}>{t('marketSettings.quizzes.columns.amount')}</th>
                  <th style={headCell} />
                </tr>
              </thead>
              <tbody>
                {editing.reward_tiers.map((tier, index) => (
                  // 行の並びそのものが意味を持つので、位置を鍵にする。
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={index}>
                    <td style={cell}>
                      <input
                        aria-label={t('marketSettings.quizzes.columns.minScore')}
                        value={String(tier.minScore)}
                        inputMode="numeric"
                        onChange={(event) =>
                          editQuiz(quiz.id, (current) => ({
                            ...current,
                            reward_tiers: current.reward_tiers.map((row, at) =>
                              at === index ? { ...row, minScore: Number(event.target.value) } : row,
                            ),
                          }))
                        }
                        style={{ ...input, width: '100px' }}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        aria-label={t('marketSettings.quizzes.columns.amount')}
                        value={String(tier.amount)}
                        inputMode="numeric"
                        onChange={(event) =>
                          editQuiz(quiz.id, (current) => ({
                            ...current,
                            reward_tiers: current.reward_tiers.map((row, at) =>
                              at === index ? { ...row, amount: Number(event.target.value) } : row,
                            ),
                          }))
                        }
                        style={{ ...input, width: '140px' }}
                      />
                    </td>
                    <td style={cell}>
                      <button
                        type="button"
                        onClick={() =>
                          editQuiz(quiz.id, (current) => ({
                            ...current,
                            reward_tiers: current.reward_tiers.filter((_, at) => at !== index),
                          }))
                        }
                        style={{ ...quietButton, padding: '6px 12px', fontSize: '13px' }}
                      >
                        {t('marketSettings.quizzes.removeTier')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              type="button"
              onClick={() =>
                editQuiz(quiz.id, (current) => ({
                  ...current,
                  reward_tiers: [...current.reward_tiers, { minScore: 0, amount: 0 }],
                }))
              }
              style={{ ...quietButton, padding: '6px 12px', fontSize: '13px', marginTop: '8px' }}
            >
              {t('marketSettings.quizzes.addTier')}
            </button>

            <label style={{ display: 'grid', gap: '6px', marginTop: '20px', maxWidth: '320px' }}>
              <span style={{ opacity: 0.7 }}>{t('marketSettings.quizzes.validDays')}</span>
              <input
                aria-label={t('marketSettings.quizzes.validDays')}
                value={String(editing.bonus_valid_days)}
                inputMode="numeric"
                onChange={(event) =>
                  editQuiz(quiz.id, (current) => ({
                    ...current,
                    bonus_valid_days: Number(event.target.value),
                  }))
                }
                style={input}
              />
            </label>

            {found.length > 0 && (
              <ul style={{ color: ALERT }} data-testid="quiz-problems">
                {found.map((problem) => (
                  <li key={`${problem.code}-${problem.value ?? ''}`}>{tierProblemText(problem)}</li>
                ))}
              </ul>
            )}

            {saved && (
              <p style={{ color: OK }} data-testid="quiz-notice">
                {t('marketSettings.quizzes.saved')}
              </p>
            )}

            <button
              type="button"
              onClick={() => void saveQuiz(editing)}
              style={{ ...button, marginTop: '12px' }}
            >
              {t('marketSettings.save')}
            </button>
          </div>
        )
      })}
    </>
  )
}

const MarketSettingsRoute = () => (
  <PageShell titleKey="marketSettings.title">
    <MarketSettingsPage />
  </PageShell>
)

/** 左のメニューに出す。文言は起動時の言語で固定される（他のページと同じ）。 */
export const config = {
  label: adminI18n.t('marketSettings.title'),
}

export default MarketSettingsRoute
