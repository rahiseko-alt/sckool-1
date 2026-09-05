import { Module } from '@medusajs/framework/utils'

import OrganizationService from './service'

/**
 * 生徒が経営する仮想企業。
 *
 * Mercur の `seller` を使わず別に持っているのは、`seller` が
 * メール・電話・住所の列を持っており（docs/decisions.md「30.」）、
 * この仕組みの企業がそれらを一切持たないため。
 */
export const ORGANIZATION_MODULE = 'organization'

export default Module(ORGANIZATION_MODULE, {
  service: OrganizationService,
})

export { OrganizationService }
export * from './name'
