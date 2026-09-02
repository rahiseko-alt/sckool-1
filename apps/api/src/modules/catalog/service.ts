import { MedusaService } from '@medusajs/framework/utils'

import { Listing } from './models/listing'
import {
  checkAvailability,
  checkProductInput,
  parseDate,
  type FieldProblem,
  type ProductInput,
  type UnavailableReason,
} from './product-input'

/** 市場に出す1件。画面がそのまま使える形にしてある。 */
export interface ListingView {
  id: string
  organization_id: string
  title: string
  description: string
  target_customer: string
  problem_solved: string
  price: number
  available_quantity: number
  image_url: string
  sale_starts_at: Date
  sale_ends_at: Date
  /** いま買えない理由。買えるなら undefined（受け入れ基準 C2）。 */
  unavailable_reason?: UnavailableReason
}

export type CreateListingResult =
  | { ok: true; listing: ListingView }
  | { ok: false; problems: FieldProblem[] }

/**
 * 商品の登録と市場一覧（受け入れ基準 C1・C2・C3）。
 */
class CatalogService extends MedusaService({ Listing }) {
  private toView(row: any, now: Date): ListingView {
    const listing: ListingView = {
      id: row.id,
      organization_id: row.organization_id,
      title: row.title,
      description: row.description,
      target_customer: row.target_customer,
      problem_solved: row.problem_solved,
      price: Number(row.price),
      available_quantity: Number(row.available_quantity),
      image_url: row.image_url,
      sale_starts_at: new Date(row.sale_starts_at),
      sale_ends_at: new Date(row.sale_ends_at),
    }

    const reason = checkAvailability(listing, now)
    if (reason) listing.unavailable_reason = reason
    return listing
  }

  /** 商品を1件登録する。問題があれば**全て**返し、1件も保存しない。 */
  async createListing(
    organizationId: string,
    input: ProductInput,
    now = new Date(),
  ): Promise<CreateListingResult> {
    const problems = checkProductInput(input)
    if (problems.length > 0) return { ok: false, problems }

    const created = await this.createListings({
      organization_id: organizationId,
      title: String(input.title).trim(),
      description: String(input.description).trim(),
      target_customer: String(input.target_customer).trim(),
      problem_solved: String(input.problem_solved).trim(),
      price: input.price as number,
      available_quantity: input.available_quantity as number,
      image_url: String(input.image_url).trim(),
      sale_starts_at: parseDate(input.sale_starts_at)!,
      sale_ends_at: parseDate(input.sale_ends_at)!,
    })

    return { ok: true, listing: this.toView(created, now) }
  }

  /** 市場一覧。買えないものも並べ、理由を添える（受け入れ基準 C2）。 */
  async listMarket(now = new Date()): Promise<ListingView[]> {
    const rows = await this.listListings({})
    return rows.map((row) => this.toView(row, now))
  }

  /** ある企業の商品だけ。 */
  async listForOrganization(organizationId: string, now = new Date()): Promise<ListingView[]> {
    const rows = await this.listListings({ organization_id: organizationId })
    return rows.map((row) => this.toView(row, now))
  }

  /** 1件を引く。 */
  async findListing(id: string, now = new Date()): Promise<ListingView | undefined> {
    const [row] = await this.listListings({ id })
    return row ? this.toView(row, now) : undefined
  }

  /**
   * 買われたぶんだけ在庫を減らす（受け入れ基準 D4）。
   *
   * 減らせなければ `false` を返す。**呼ぶ側は必ずこれを見ること。**
   * 在庫を確かめずに MP だけ動かすと、売り切れた商品が売れ続ける。
   */
  async decreaseQuantity(id: string, amount = 1): Promise<boolean> {
    const [row] = await this.listListings({ id })
    if (!row) return false

    const current = Number(row.available_quantity)
    if (current < amount) return false

    await this.updateListings({ id, available_quantity: current - amount })
    return true
  }
}

export default CatalogService
