import { DEFAULT_LOCALE, type LocaleCode } from './locales'

/**
 * 辞書の検査に使う設定。**検査スクリプトと単体テストの両方から読む。**
 * 片方にだけ書くと、CI が通るのに手元の検査が落ちる（またはその逆）になる。
 */

/** 突き合わせの基準にする言語。ここに無いキーは他の言語にも要らない。 */
export const BASE_LOCALE: LocaleCode = DEFAULT_LOCALE

/**
 * 基準の言語と同じ文字列のままでよいキー。
 *
 * **むやみに増やさないこと。** ここに足すのは「訳すと逆に分からなくなるもの」だけ。
 */
export const ALLOW_SAME_AS_BASE = [
  // 通貨の単位。どの言語でも MP と表記する（要件3）。
  'money.unit',
  // 企業の id。画面に出す語としては訳さない（生徒の画面の表記に合わせる）。
  'organizations.columns.marketId',
  // 並びの区切り記号。中国語の読点は日本語と同じ「、」を使う。
  'purchaseLog.byAdmin.separator',
  // Market ID の入力例。どの言語でも同じ形（MKT-XXXX-XXXX）で発行される。
  'passwordReset.marketIdPlaceholder',
  // テスト翻訳の言語選択肢。各言語は自分の文字で表記する（切替の選択肢と同じ考え方）ので、
  // どの言語の辞書でも同じ綴りになる。
  'marketSettings.quizzes.translation.locale.en',
  'marketSettings.quizzes.translation.locale.zh-CN',
  'marketSettings.quizzes.translation.locale.vi-VN',
  'marketSettings.quizzes.translation.locale.ne-NP',
  'marketSettings.quizzes.translation.locale.th-TH',
] as const
