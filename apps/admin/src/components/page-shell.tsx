import type { ReactNode } from 'react'
import { I18nextProvider, useTranslation } from 'react-i18next'

import { adminI18n } from '../i18n'
import { LanguageSwitcher } from './language-switcher'

/**
 * 先生が見る画面の外枠。**3つのページで同じものを使う。**
 *
 * ここでしか `I18nextProvider` を置かない。中身のページは自分の言語を
 * 気にせず `useTranslation()` を呼べばよく、Mercur 側の画面には触らない。
 *
 * 見出しの高さに言語の切替を並べるので、**どのページでも右上の同じ位置**に出る。
 */
export function PageShell({ titleKey, children }: { titleKey: string; children: ReactNode }) {
  return (
    <I18nextProvider i18n={adminI18n}>
      {/* 検査が「自分たちのページの中だけ」を見るための目印。
          周りの Mercur の画面（左のメニューなど）はこちらの辞書では訳せない。 */}
      <div data-testid="sckool-admin-page" style={{ padding: '24px', maxWidth: '1200px' }}>
        <PageHeader titleKey={titleKey} />
        {children}
      </div>
    </I18nextProvider>
  )
}

function PageHeader({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      <h1 style={{ fontSize: '24px', margin: 0 }}>{t(titleKey)}</h1>
      <LanguageSwitcher />
    </div>
  )
}
