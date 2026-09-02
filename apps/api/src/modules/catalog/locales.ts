import type { MedusaRequest } from '@medusajs/framework/http'

/**
 * 対応する言語（要件34）。
 *
 * **画面側（`apps/storefront/src/i18n/locales.ts`）と同じ並びにしておくこと。**
 * ずれると、画面では選べるのにサーバーが訳を受け付けない言語ができる。
 * 1つのファイルから両方が読む形にはできない（別のアプリで、別の作りのため）`[曖昧]`。
 */
export const LOCALE_CODES = ['ja-JP', 'en', 'zh-CN', 'vi-VN', 'ne-NP', 'th-TH'] as const

/**
 * 呼び出しから閲覧者の言語を読む。
 *
 * ヘッダ（`x-locale`）とクエリ（`?locale=en`）の両方を見る。
 * 知らない言語なら `undefined` を返し、原文を出す。
 *
 * **クエリは `req.query` ではなく URL から直接読む。** `/store/*` では
 * Medusa が `req.query` を作り直しており、こちらで足した項目が消える
 * （実際にそうなって気づいた）。URL の文字列は必ず残っている。
 */
export function localeOf(req: MedusaRequest): string | undefined {
  const fromHeader = typeof req.headers['x-locale'] === 'string' ? req.headers['x-locale'] : ''

  let fromQuery = ''
  const url = typeof req.url === 'string' ? req.url : ''
  const start = url.indexOf('?')
  if (start >= 0) {
    fromQuery = new URLSearchParams(url.slice(start + 1)).get('locale') ?? ''
  }

  const locale = (fromHeader || fromQuery).trim()
  return (LOCALE_CODES as readonly string[]).includes(locale) ? locale : undefined
}
