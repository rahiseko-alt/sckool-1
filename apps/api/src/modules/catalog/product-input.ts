/**
 * 商品を登録するときの決まり（要件6、受け入れ基準 C1・C3）。
 *
 * 要件6は必須項目を8つ挙げている。ここで大事なのは商品そのものより
 * 「**誰のどんな課題を解決する商品なのか**」で、`target_customer` と
 * `problem_solved` はそのために必須にしている（要件5）。
 *
 * 純粋な関数だけを置く。データベースにも HTTP にも触らない。
 */

/** 要件6の必須項目。ここを削ると授業の狙いが崩れるので、勝手に減らさないこと。 */
export const REQUIRED_FIELDS = [
  'title',
  'description',
  'target_customer',
  'problem_solved',
  'price',
  'available_quantity',
  'image_url',
  'sale_starts_at',
  'sale_ends_at',
] as const

export type RequiredField = (typeof REQUIRED_FIELDS)[number]

export interface ProductInput {
  title?: unknown
  description?: unknown
  target_customer?: unknown
  problem_solved?: unknown
  price?: unknown
  available_quantity?: unknown
  image_url?: unknown
  sale_starts_at?: unknown
  sale_ends_at?: unknown
}

/** 1つの項目についての問題。画面はこれを見て、その項目の下にエラーを出す。 */
export interface FieldProblem {
  field: RequiredField
  problem:
    | 'missing'
    | 'too_long'
    /** 価格や数量が整数でない、または小さすぎる。 */
    | 'not_a_positive_integer'
    /** 日付として読めない。 */
    | 'invalid_date'
    /** 販売終了が開始より前。 */
    | 'ends_before_starts'
}

const MAX_LENGTHS: Partial<Record<RequiredField, number>> = {
  title: 80,
  description: 2_000,
  target_customer: 200,
  problem_solved: 500,
  image_url: 2_000,
}

/** 価格の下限。0や負の値では市場が成立しない（受け入れ基準 C3）。 */
export const MIN_PRICE = 1

/** 1回の登録で出せる数の上限。60人の市場で桁を間違えると相場が壊れる。 */
export const MAX_QUANTITY = 1_000

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** 1以上の整数か。小数と文字列の数字は通さない。 */
function isPositiveInteger(value: unknown, min: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
}

/**
 * 入力を調べ、問題を**全て**返す。空配列なら登録してよい。
 *
 * 最初の1つで打ち切らないのは、利用者が一度に全部直せるようにするため。
 * 1つずつ返すと、直しては断られるのを8回繰り返すことになる。
 */
export function checkProductInput(input: ProductInput): FieldProblem[] {
  const problems: FieldProblem[] = []

  for (const field of ['title', 'description', 'target_customer', 'problem_solved', 'image_url'] as const) {
    const value = input[field]
    if (!isFilledString(value)) {
      problems.push({ field, problem: 'missing' })
      continue
    }
    const max = MAX_LENGTHS[field]
    if (max !== undefined && value.trim().length > max) {
      problems.push({ field, problem: 'too_long' })
    }
  }

  if (input.price === undefined || input.price === null || input.price === '') {
    problems.push({ field: 'price', problem: 'missing' })
  } else if (!isPositiveInteger(input.price, MIN_PRICE)) {
    problems.push({ field: 'price', problem: 'not_a_positive_integer' })
  }

  if (
    input.available_quantity === undefined ||
    input.available_quantity === null ||
    input.available_quantity === ''
  ) {
    problems.push({ field: 'available_quantity', problem: 'missing' })
  } else if (
    !isPositiveInteger(input.available_quantity, 1) ||
    (input.available_quantity as number) > MAX_QUANTITY
  ) {
    problems.push({ field: 'available_quantity', problem: 'not_a_positive_integer' })
  }

  const starts = parseDate(input.sale_starts_at)
  const ends = parseDate(input.sale_ends_at)

  if (input.sale_starts_at === undefined || input.sale_starts_at === null || input.sale_starts_at === '') {
    problems.push({ field: 'sale_starts_at', problem: 'missing' })
  } else if (!starts) {
    problems.push({ field: 'sale_starts_at', problem: 'invalid_date' })
  }

  if (input.sale_ends_at === undefined || input.sale_ends_at === null || input.sale_ends_at === '') {
    problems.push({ field: 'sale_ends_at', problem: 'missing' })
  } else if (!ends) {
    problems.push({ field: 'sale_ends_at', problem: 'invalid_date' })
  } else if (starts && ends.getTime() <= starts.getTime()) {
    problems.push({ field: 'sale_ends_at', problem: 'ends_before_starts' })
  }

  return problems
}

/** 日付として読めれば Date を、読めなければ undefined を返す。 */
export function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * いま買える商品か（受け入れ基準 C2）。
 *
 * 買えない理由を返すのは、画面に「販売期間が終わりました」「売り切れました」と
 * 出し分けるため。ただ押せなくするだけでは、なぜ買えないのか分からない。
 */
export type UnavailableReason = 'not_started' | 'ended' | 'sold_out'

export function checkAvailability(
  product: { sale_starts_at: Date; sale_ends_at: Date; available_quantity: number },
  now: Date = new Date(),
): UnavailableReason | undefined {
  if (product.available_quantity <= 0) return 'sold_out'
  if (now.getTime() < product.sale_starts_at.getTime()) return 'not_started'
  if (now.getTime() > product.sale_ends_at.getTime()) return 'ended'
  return undefined
}
