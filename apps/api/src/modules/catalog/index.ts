import { Module } from '@medusajs/framework/utils'

import CatalogService from './service'

/**
 * 生徒の企業が市場に出す商品。
 *
 * Medusa の `product` を使わない理由は models/listing.ts に書いてある。
 * 要点は、要件6の必須項目が Medusa に無いことと、価格が MP の整数で
 * 通貨・税・配送を必要としないこと。
 */
export const CATALOG_MODULE = 'catalog'

export default Module(CATALOG_MODULE, {
  service: CatalogService,
})

export { CatalogService }
export * from './product-input'
export type { ListingView, CreateListingResult } from './service'
