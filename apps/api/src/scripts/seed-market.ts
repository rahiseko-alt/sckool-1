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

  // 運営者のアカウント。生徒のものではないので email 列を使うが、
  // 値は @anon.invalid（実在しないと決められた予約ドメイン）にする。
  // docs/decisions.md「30.」の検査もこの形だけを通す。
  const adminIdentifier = process.env.SEED_ADMIN_IDENTIFIER ?? 'probe-admin@anon.invalid'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'probe-password-1234'

  const userService = container.resolve(Modules.USER)
  const authService = container.resolve(Modules.AUTH)

  /**
   * 運営者は2人用意する。要件10で先生は4人程度を想定しており、
   * **購入ログを先生どうしで見せ合う**（受け入れ基準 H4）ので、
   * 1人だけだと「他の先生の購入が見えるか」を確かめられない。
   */
  const secondAdminIdentifier =
    process.env.SEED_ADMIN_2_IDENTIFIER ?? 'probe-admin-2@anon.invalid'

  for (const identifier of [adminIdentifier, secondAdminIdentifier]) {
    const [existingUser] = await userService.listUsers({ email: identifier })
    if (existingUser) continue

    const registered = await authService.register('emailpass', {
      body: { email: identifier, password: adminPassword },
    } as never)

    const user = await userService.createUsers({ email: identifier })
    if (registered.authIdentity) {
      await authService.updateAuthIdentities({
        id: registered.authIdentity.id,
        app_metadata: { user_id: user.id },
      })
    }
    logger.info(`運営者のアカウントを作りました: ${identifier}`)
  }

  // 授業で使うテストを1つ用意する（要件18・32）。独占禁止法を題材にしたのは、
  // 要件18が私的独占・不当な取引制限・不公正な取引方法を中心に扱うとしているため。
  const quizService = container.resolve('quiz') as any
  const [existingQuiz] = await quizService.listQuizzes({ topic: '独占禁止法' })
  if (!existingQuiz) {
    await quizService.createQuizzes({
      title: 'Knowledge Challenge',
      topic: '独占禁止法',
      questions: [
        {
          id: 'q1',
          prompt: '複数の企業が話し合って売値をそろえる行為を何といいますか',
          choices: ['カルテル', '値引き', '市場調査', '広告'],
          correctIndex: 0,
        },
        {
          id: 'q2',
          prompt: 'A社がB社から買い、B社がC社から買い、C社がA社から買う。実体のない取引を回す行為は',
          choices: ['共同購入', '循環取引', '相互扶助', '共同開発'],
          correctIndex: 1,
        },
        {
          id: 'q3',
          prompt: '「この市場ではA社だけが売る」と企業どうしで決める行為は',
          choices: ['販売提携', '市場分割', '専門化', '委託販売'],
          correctIndex: 1,
        },
        {
          id: 'q4',
          prompt: '一社の市場シェアが高いこと自体は',
          choices: ['ただちに違法', '違法ではない', '常に罰則の対象', '報告が必要'],
          correctIndex: 1,
        },
        {
          id: 'q5',
          prompt: '独占禁止法が守ろうとしているものは',
          choices: ['特定企業の利益', '公正で自由な競争', '価格の統一', '売上の平等'],
          correctIndex: 1,
        },
      ],
      reward_tiers: [
        { minScore: 90, amount: 1500 },
        { minScore: 80, amount: 1000 },
        { minScore: 60, amount: 500 },
        { minScore: 0, amount: 0 },
      ],
      bonus_valid_days: 7,
      is_open: true,
    })
    logger.info('テストを1つ用意しました（独占禁止法）')
  }

  console.log('\n=== 用意できたもの ===')
  console.log(`販売channel: ${channel.id}`)
  console.log(`公開鍵: ${key.token}`)
  console.log(`運営者: ${adminIdentifier} / ${secondAdminIdentifier}`)
  console.log('\nStore API を呼ぶときは、この鍵を x-publishable-api-key に入れてください。')
  console.log('※ 運営者のパスワードは開発用の既定値です。本番では環境変数で与えてください。')
}
