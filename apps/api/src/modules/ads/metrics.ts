/**
 * 広告の効果の数え方（要件13、受け入れ基準 F2）。純粋な関数だけを置く。
 *
 * 生徒が見るのは「広告費を出したら売上がどう変わったか」なので、
 * 数字の意味を取り違えないことが大事。ここで定義を1箇所に固める。
 */

export interface AdMetrics {
  /** 表示された回数。 */
  impressions: number
  /** 押された回数。 */
  clicks: number
  /** 押した人が買った回数。 */
  conversions: number
  /** 押された割合。表示が0なら0。 */
  ctr: number
  /** 払った額。 */
  spend: number
  /** 広告経由で立った売上。 */
  revenue: number
  /** 広告費1に対する売上。払っていなければ0。 */
  roas: number
}

export interface AdEventCounts {
  impressions: number
  clicks: number
  conversions: number
  revenue: number
}

/**
 * 数字をまとめる。
 *
 * **割り算は分母が0のときに0を返す。** `NaN` や `Infinity` を画面に出すと、
 * 生徒には何が起きたか分からない。
 */
export function calculateMetrics(counts: AdEventCounts, spend: number): AdMetrics {
  const ctr = counts.impressions === 0 ? 0 : counts.clicks / counts.impressions
  const roas = spend === 0 ? 0 : counts.revenue / spend

  return {
    impressions: counts.impressions,
    clicks: counts.clicks,
    conversions: counts.conversions,
    // 表示は小数第3位まで。1000回に1回の違いが見える細かさ。
    ctr: Math.round(ctr * 1000) / 1000,
    spend,
    revenue: counts.revenue,
    roas: Math.round(roas * 100) / 100,
  }
}

/** 複数の広告枠の数字を1つにまとめる（企業ダッシュボード用）。 */
export function sumMetrics(all: readonly AdMetrics[]): AdMetrics {
  const totals = all.reduce(
    (acc, item) => ({
      impressions: acc.impressions + item.impressions,
      clicks: acc.clicks + item.clicks,
      conversions: acc.conversions + item.conversions,
      revenue: acc.revenue + item.revenue,
      spend: acc.spend + item.spend,
    }),
    { impressions: 0, clicks: 0, conversions: 0, revenue: 0, spend: 0 },
  )

  return calculateMetrics(totals, totals.spend)
}

/** その広告がいま出ているか。 */
export function isActive(
  placement: { starts_at: Date; ends_at: Date },
  now: Date = new Date(),
): boolean {
  return now >= placement.starts_at && now <= placement.ends_at
}

/**
 * 広告枠の値段。日数に比例する。
 *
 * 1日あたりの単価は管理者が変えられるようにする。60人の市場で高すぎると
 * 誰も出さず、安すぎると全員が出して枠の意味が無くなる。
 */
export const DEFAULT_DAILY_RATE = 500

export function priceFor(days: number, dailyRate = DEFAULT_DAILY_RATE): number | undefined {
  if (!Number.isInteger(days) || days < 1) return undefined
  return days * dailyRate
}
