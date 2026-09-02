import { MedusaService } from '@medusajs/framework/utils'

import { AdEvent, AdPlacement } from './models/ad-slot'
import {
  calculateMetrics,
  isActive,
  priceFor,
  sumMetrics,
  type AdMetrics,
} from './metrics'

export interface PlacementView {
  id: string
  organization_id: string
  listing_id: string
  spend: number
  starts_at: Date
  ends_at: Date
  is_active: boolean
}

/**
 * 広告枠の販売と効果の記録（要件12・13、受け入れ基準 F1・F2）。
 *
 * **MP の支払いはここでは行わない。** 口座の扱いは mp モジュールに任せ、
 * 呼び出し側（API の経路）が「払えたら枠を作る」順で進める。
 */
class AdsService extends MedusaService({ AdPlacement, AdEvent }) {
  private toView(row: any, now: Date): PlacementView {
    const placement = {
      id: row.id,
      organization_id: row.organization_id,
      listing_id: row.listing_id,
      spend: Number(row.spend),
      starts_at: new Date(row.starts_at),
      ends_at: new Date(row.ends_at),
    }
    return { ...placement, is_active: isActive(placement, now) }
  }

  /** 日数から値段を出す。 */
  quote(days: number): number | undefined {
    return priceFor(days)
  }

  /** 枠を作る。**払えたことを確かめてから呼ぶこと。** */
  async createPlacement(input: {
    organizationId: string
    listingId: string
    days: number
    spend: number
    now?: Date
  }): Promise<PlacementView> {
    const now = input.now ?? new Date()
    const endsAt = new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000)

    const created = await this.createAdPlacements({
      organization_id: input.organizationId,
      listing_id: input.listingId,
      spend: input.spend,
      starts_at: now,
      ends_at: endsAt,
    })

    return this.toView(created, now)
  }

  /** いま出ている広告。トップページの Featured 枠に並べる。 */
  async listActive(now = new Date()): Promise<PlacementView[]> {
    const rows = await this.listAdPlacements({})
    return rows.map((row) => this.toView(row, now)).filter((placement) => placement.is_active)
  }

  /** ある企業の広告枠すべて。 */
  async listForOrganization(organizationId: string, now = new Date()): Promise<PlacementView[]> {
    const rows = await this.listAdPlacements({ organization_id: organizationId })
    return rows.map((row) => this.toView(row, now))
  }

  /** 表示・クリック・購入を1件記録する。 */
  async record(
    placementId: string,
    kind: 'impression' | 'click' | 'conversion',
    revenue = 0,
  ): Promise<void> {
    await this.createAdEvents({ placement_id: placementId, kind, revenue })
  }

  /**
   * その商品にいま出ている広告を探す。
   *
   * 購入が広告経由かどうかを判定するのに使う。厳密には「押してから買ったか」を
   * 見るべきだが、MVP では**出ている広告がある商品の購入**を広告経由として数える。
   * この割り切りは docs/decisions.md「34.」に記録した。
   */
  async findActiveForListing(listingId: string, now = new Date()): Promise<PlacementView | undefined> {
    const rows = await this.listAdPlacements({ listing_id: listingId })
    return rows.map((row) => this.toView(row, now)).find((placement) => placement.is_active)
  }

  /** 1つの枠の数字。 */
  async metricsFor(placementId: string): Promise<AdMetrics> {
    const [placement] = await this.listAdPlacements({ id: placementId })
    const events = await this.listAdEvents({ placement_id: placementId })

    return calculateMetrics(
      {
        impressions: events.filter((event) => event.kind === 'impression').length,
        clicks: events.filter((event) => event.kind === 'click').length,
        conversions: events.filter((event) => event.kind === 'conversion').length,
        revenue: events.reduce((sum, event) => sum + Number(event.revenue), 0),
      },
      placement ? Number(placement.spend) : 0,
    )
  }

  /** ある企業の広告をまとめた数字（企業ダッシュボード用）。 */
  async metricsForOrganization(organizationId: string): Promise<AdMetrics> {
    const placements = await this.listAdPlacements({ organization_id: organizationId })
    const all = await Promise.all(placements.map((placement) => this.metricsFor(placement.id)))
    return sumMetrics(all)
  }
}

export default AdsService
