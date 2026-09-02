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
 * 訳し忘れをここに逃がすと、検査そのものが意味を失う。
 */
export const ALLOW_SAME_AS_BASE = [
  // サービス名。訳すと別のサービスに見える。
  'app.name',
  // 通貨の単位。どの言語でも MP と表記する（要件3）。
  'money.unit',
  // 「市場」はサービス名と同じ綴りになる言語がある。
  'market.title',
  'nav.market',
  // 「ID」。日本語でもそのまま使う語で、英語・中国語・ベトナム語でも同じ綴りになる。
  'auth.marketId',
] as const
