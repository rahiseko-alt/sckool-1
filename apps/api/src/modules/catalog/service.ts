import { MedusaService } from '@medusajs/framework/utils'

import { Listing } from './models/listing'
import { ListingTranslation } from './models/listing-translation'
import {
  normalizeTranslations,
  pickTranslation,
  type Translation,
} from './translation'
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
  /**
   * 訳を使って出したときに、どの言語の訳かを添える（受け入れ基準 I3）。
   * 原文をそのまま出したときは付かない。
   */
  translated_from?: string
}

export type CreateListingResult =
  | { ok: true; listing: ListingView }
  | { ok: false; problems: FieldProblem[] }

/**
 * 商品の登録と市場一覧（受け入れ基準 C1・C2・C3）。
 */
class CatalogService extends MedusaService({ Listing, ListingTranslation }) {
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

  /**
   * 商品を1件登録する。問題があれば**全て**返し、1件も保存しない。
   *
   * 訳（`translations`）は**任意**。必須にすると、6言語ぶん書けない生徒は
   * 商品を出せなくなる（受け入れ基準 I3）。
   */
  async createListing(
    organizationId: string,
    input: ProductInput & { translations?: unknown },
    now = new Date(),
    allowedLocales: readonly string[] = [],
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

    const translations = normalizeTranslations(input.translations, allowedLocales)
    if (translations.length > 0) {
      await this.createListingTranslations(
        translations.map((translation) => ({ ...translation, listing_id: created.id })),
      )
    }

    return { ok: true, listing: this.toView(created, now) }
  }

  /** ある商品の訳をすべて読む。 */
  async listTranslationsFor(listingId: string): Promise<Translation[]> {
    const rows = await this.listListingTranslations({ listing_id: listingId })
    return rows.map((row) => ({
      locale_code: row.locale_code,
      title: row.title,
      description: row.description,
    }))
  }

  /**
   * 閲覧者の言語に合わせて商品名と説明を差し替える（受け入れ基準 I3）。
   *
   * 訳が無ければ原文のまま返す。**キーや空文字は出さない。**
   */
  private async withTranslation(listing: ListingView, locale?: string): Promise<ListingView> {
    if (!locale) return listing
    const chosen = pickTranslation(listing, await this.listTranslationsFor(listing.id), locale)
    return {
      ...listing,
      title: chosen.title,
      description: chosen.description,
      ...(chosen.locale_code ? { translated_from: chosen.locale_code } : {}),
    }
  }

  /** 市場一覧。買えないものも並べ、理由を添える（受け入れ基準 C2）。 */
  async listMarket(now = new Date(), locale?: string): Promise<ListingView[]> {
    const rows = await this.listListings({})
    const listings = rows.map((row) => this.toView(row, now))
    if (!locale) return listings

    /**
     * 訳は**まとめて1回で読む**。1件ずつ読むと、商品の数だけ問い合わせが出る。
     * 60人が同時に市場を開く前提なので、ここは詰めておく。
     */
    const all = await this.listListingTranslations({
      listing_id: listings.map((listing) => listing.id),
    })
    const byListing = new Map<string, Translation[]>()
    for (const row of all) {
      const list = byListing.get(row.listing_id) ?? []
      list.push({
        locale_code: row.locale_code,
        title: row.title,
        description: row.description,
      })
      byListing.set(row.listing_id, list)
    }

    return listings.map((listing) => {
      const chosen = pickTranslation(listing, byListing.get(listing.id) ?? [], locale)
      return {
        ...listing,
        title: chosen.title,
        description: chosen.description,
        ...(chosen.locale_code ? { translated_from: chosen.locale_code } : {}),
      }
    })
  }

  /** ある企業の商品だけ。 */
  async listForOrganization(organizationId: string, now = new Date()): Promise<ListingView[]> {
    const rows = await this.listListings({ organization_id: organizationId })
    return rows.map((row) => this.toView(row, now))
  }

  /** 1件を引く。 */
  async findListing(
    id: string,
    now = new Date(),
    locale?: string,
  ): Promise<ListingView | undefined> {
    const [row] = await this.listListings({ id })
    if (!row) return undefined
    return this.withTranslation(this.toView(row, now), locale)
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

  /**
   * 押さえた在庫を戻す。
   *
   * 購入は「先に在庫を押さえ、MP の移動に失敗したら戻す」順で行う。
   * これが無いと、買えなかった商品の在庫が減ったまま戻らない。
   */
  async increaseQuantity(id: string, amount = 1): Promise<void> {
    const [row] = await this.listListings({ id })
    if (!row) return
    await this.updateListings({ id, available_quantity: Number(row.available_quantity) + amount })
  }
}

export default CatalogService
