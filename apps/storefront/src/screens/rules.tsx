import { useTranslation } from 'react-i18next'

import { card, hint } from '../ui'

/**
 * ルール説明とはじめかた（要件18〜22、受け入れ基準 I2）。
 *
 * **禁止していることを、なぜ禁止なのかまで書く。** 「カルテル禁止」とだけ書いても、
 * 何がそれに当たるのか分からない。例を1つずつ添えてある。
 *
 * **仕組みが自動で罰しない**ことも書く。数字は偏りを見せるだけで、
 * 買い合いと「本当に良いと思って買った」を区別できない。
 */

const RULE_SECTIONS = ['cartel', 'marketSplit', 'circular'] as const
const TUTORIAL_STEPS = ['step1', 'step2', 'step3', 'step4'] as const

export function RulesScreen() {
  const { t } = useTranslation()

  return (
    <div style={{ maxWidth: '720px' }}>
      <h1 style={{ fontSize: 'var(--text-h1)', margin: 0 }}>{t('tutorial.title')}</h1>
      <p style={hint}>{t('tutorial.lead')}</p>

      <ol style={{ listStyle: 'none', padding: 0 }}>
        {TUTORIAL_STEPS.map((step) => (
          <li key={step} style={{ ...card, marginBottom: 'var(--sp-3)' }}>
            <div style={{ fontWeight: 600 }}>{t(`tutorial.${step}.title`)}</div>
            <p style={{ marginBottom: 0 }}>{t(`tutorial.${step}.body`)}</p>
          </li>
        ))}
      </ol>

      <h2 style={{ fontSize: 'var(--text-h1)', marginTop: 'var(--sp-12)' }}>{t('rules.title')}</h2>
      <p style={hint}>{t('rules.lead')}</p>

      {RULE_SECTIONS.map((section) => (
        <section key={section} style={{ ...card, marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontWeight: 600 }}>{t(`rules.${section}.title`)}</div>
          <p>{t(`rules.${section}.body`)}</p>
          {/* 例を添えないと、何がそれに当たるのか分からない。 */}
          <p style={{ ...hint, marginBottom: 0 }}>{t(`rules.${section}.example`)}</p>
        </section>
      ))}

      <section style={{ ...card, marginBottom: 'var(--sp-3)' }}>
        <div style={{ fontWeight: 600 }}>{t('rules.favoritism.title')}</div>
        <p style={{ marginBottom: 0 }}>{t('rules.favoritism.body')}</p>
      </section>

      <section style={{ ...card, marginBottom: 'var(--sp-3)' }}>
        <div style={{ fontWeight: 600 }}>{t('rules.watching.title')}</div>
        <p style={{ marginBottom: 0 }}>{t('rules.watching.body')}</p>
      </section>

      {/* 仕組みが自動で罰しないことを最後に書く。数字は偏りを見せるだけ。 */}
      <p style={hint}>{t('rules.penalty')}</p>
    </div>
  )
}
