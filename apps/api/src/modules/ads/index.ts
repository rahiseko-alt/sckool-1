import { Module } from '@medusajs/framework/utils'

import AdsService from './service'

/**
 * 広告枠の販売と効果の記録（要件12・13）。
 *
 * 広告は「お金を使わない企業は成長できない」という構造（要件4）の柱。
 * 払った MP は市場から出ていくので、持っているだけでは有利にならない。
 */
export const ADS_MODULE = 'ads'

export default Module(ADS_MODULE, {
  service: AdsService,
})

export { AdsService }
export * from './metrics'
export type { PlacementView } from './service'
