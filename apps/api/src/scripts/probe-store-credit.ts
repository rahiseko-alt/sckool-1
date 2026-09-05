import type { ExecArgs } from '@medusajs/framework/types'

/**
 * Store Credit を MP 口座に流用できるかを、実際に動かして確かめる（T003）。
 *
 * 実行:
 *   node scripts/run-api.mjs exec ./src/scripts/probe-store-credit.ts
 *
 * 確かめること:
 *   1. 口座を作れるか
 *   2. 入金・出金で残高が変わるか
 *   3. **有効期限**を持たせられるか（受け入れ基準 E2 に要る）
 *   4. 企業から企業へ移せるか（受け入れ基準 D1 に要る）
 */
export default async function probeStoreCredit({ container }: ExecArgs) {
  const service: any = container.resolve('store_credit')

  const report = (label: string, value: unknown) => {
    console.log(`  ${label}: ${JSON.stringify(value)?.slice(0, 300)}`)
  }

  console.log('\n=== 1) 口座を作る ===')
  const account = await service.createStoreCreditAccounts({
    code: `probe-${Date.now()}`,
    currency_code: 'jpy',
    // 本来は顧客に結びつける欄。企業（seller）ではないことに注意。
    // 顧客と通貨の組でひとつしか作れない（実行して確かめた制約）ので毎回変える。
    customer_id: `probe-customer-${Date.now()}`,
  })
  report('できた口座', { id: account.id, code: account.code, customer_id: account.customer_id })

  console.log('\n=== 2) 入金してから出金する ===')
  await service.createAccountTransactions({
    account_id: account.id,
    amount: 100_000,
    type: 'credit',
    reference: 'probe',
    reference_id: 'probe-1',
    note: '初期資金',
  })
  await service.createAccountTransactions({
    account_id: account.id,
    amount: -2_500,
    type: 'debit',
    reference: 'probe',
    reference_id: 'probe-2',
    note: '商品購入',
  })
  const transactions = await service.listAccountTransactions({ account_id: account.id })
  const balance = transactions.reduce((sum: number, t: any) => sum + Number(t.amount), 0)
  report('取引の件数', transactions.length)
  report('合計（＝残高）', balance)

  console.log('\n=== 3) 有効期限を持たせられるか ===')
  try {
    const withExpiry = await service.createAccountTransactions({
      account_id: account.id,
      amount: 1_500,
      type: 'credit',
      reference: 'probe',
      reference_id: 'probe-3',
      note: 'ボーナス',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    report('expires_at を渡した結果', {
      保存された: 'expires_at' in withExpiry ? withExpiry.expires_at : '欄が無い',
    })
  } catch (error) {
    report('expires_at を渡した結果', `失敗: ${(error as Error).message}`)
  }

  console.log('\n=== 4) 口座が持つ欄の一覧 ===')
  report('口座', Object.keys(account))
  report('取引', Object.keys(transactions[0] ?? {}))
}
