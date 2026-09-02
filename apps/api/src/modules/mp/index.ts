import { Module } from '@medusajs/framework/utils'

import MpService from './service'

/**
 * MP（この市場だけで通じる仮想通貨）の口座と取引履歴。
 *
 * Medusa の Store Credit を流用しなかった理由は docs/decisions.md「33.」。
 * 要点は、ボーナスに有効期限を持たせられないこと、口座が顧客ひとりにつき1つで
 * 企業から企業への移動を表せないこと。
 */
export const MP_MODULE = 'mp'

export default Module(MP_MODULE, {
  service: MpService,
})

export { MpService }
export * from './ledger'
