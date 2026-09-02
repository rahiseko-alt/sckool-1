import type { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'

/**
 * 市場を動かすのに最低限いるものを用意する。何度実行しても同じ結果になる。
 *
 * 実行:
 *   node scripts/run-api.mjs exec ./src/scripts/seed-market.ts
 *
 * 用意するもの:
 *   - 公開鍵（Store API を呼ぶのに要る）
 *   - 販売channel（商品を並べる場所）
 *
 * **生徒のアカウントはここでは作らない。** 生徒は自分で作る（受け入れ基準 A1）。
 */
export default async function seedMarket({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apiKeyService = container.resolve(Modules.API_KEY)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  const CHANNEL_NAME = 'Market'
  const KEY_TITLE = 'storefront'

  let [channel] = await salesChannelService.listSalesChannels({ name: CHANNEL_NAME })
  if (!channel) {
    channel = await salesChannelService.createSalesChannels({
      name: CHANNEL_NAME,
      description: '生徒の企業が商品を並べる市場',
    })
    logger.info(`販売channel を作りました: ${channel.id}`)
  }

  let [key] = await apiKeyService.listApiKeys({ title: KEY_TITLE, type: 'publishable' })
  if (!key) {
    key = await apiKeyService.createApiKeys({
      title: KEY_TITLE,
      type: 'publishable',
      created_by: 'seed',
    })
    logger.info(`公開鍵を作りました: ${key.id}`)
  }

  // 鍵と販売channel を結びつけないと、商品の取得が空になる。
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
  await remoteLink.create({
    [Modules.API_KEY]: { publishable_key_id: key.id },
    [Modules.SALES_CHANNEL]: { sales_channel_id: channel.id },
  })

  console.log('\n=== 用意できたもの ===')
  console.log(`販売channel: ${channel.id}`)
  console.log(`公開鍵: ${key.token}`)
  console.log('\nStore API を呼ぶときは、この鍵を x-publishable-api-key に入れてください。')
}
