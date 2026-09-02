import type { ExecArgs } from '@medusajs/framework/types'

import { MP_MODULE } from '../modules/mp'
import type MpService from '../modules/mp/service'

/**
 * MP 口座が受け入れ基準どおりに動くかを、実際のデータベースで確かめる。
 *
 * 実行:
 *   node scripts/run-api.mjs exec ./src/scripts/check-mp.ts
 *
 * 純粋な計算は ledger.test.ts が見ている。ここが見るのは
 * **保存して読み直しても同じ結果になるか**（型の変換、期限の扱い、
 * 追記しかしないこと）。
 */
export default async function checkMp({ container }: ExecArgs) {
  const mp = container.resolve(MP_MODULE) as MpService

  const stamp = Date.now()
  const buyer = `org-buyer-${stamp}`
  const seller = `org-seller-${stamp}`
  const failures: string[] = []

  const expect = (label: string, actual: unknown, wanted: unknown) => {
    const ok = JSON.stringify(actual) === JSON.stringify(wanted)
    console.log(`  ${ok ? '通った' : '通らない'}: ${label}（${JSON.stringify(actual)}）`)
    if (!ok) failures.push(`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(wanted)}`)
  }

  console.log('\n=== 初期資金を配る（受け入れ基準 B2）===')
  await mp.grantInitialFunds(buyer, 100_000)
  await mp.grantInitialFunds(seller, 100_000)
  expect('買う側の残高', (await mp.getBalance(buyer)).total, 100_000)

  console.log('\n=== 履歴の合計＝残高（受け入れ基準 B3）===')
  const entries = await mp.listEntriesFor(buyer)
  const sum = entries.reduce((total, entry) => total + entry.amount, 0)
  expect('合計と残高が一致', sum, (await mp.getBalance(buyer)).total)

  console.log('\n=== 期限つきボーナス（受け入れ基準 E1・E2）===')
  const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await mp.grantBonus({
    organizationId: buyer,
    amount: 1_500,
    expiresAt: inSevenDays,
    reference: `quiz-${stamp}`,
  })
  const withBonus = await mp.getBalance(buyer)
  expect('通常とボーナスを分けて数える', [withBonus.normal, withBonus.bonus], [100_000, 1_500])

  console.log('\n=== 支払いはボーナスから先に（受け入れ基準 E1）===')
  const moved = await mp.transfer({
    buyerId: buyer,
    sellerId: seller,
    amount: 2_000,
    reference: `order-${stamp}`,
  })
  expect('移動できた', moved, true)
  const afterBuy = await mp.getBalance(buyer)
  expect('ボーナスから先に減る', [afterBuy.normal, afterBuy.bonus], [99_500, 0])
  expect('売った側が受け取る', (await mp.getBalance(seller)).normal, 102_000)

  console.log('\n=== 受け取りは通常残高に入る（受け入れ基準 E6）===')
  expect('売った側にボーナスは入らない', (await mp.getBalance(seller)).bonus, 0)

  console.log('\n=== 残高不足は拒む（受け入れ基準 D3）===')
  const before = await mp.getBalance(buyer)
  const rejected = await mp.transfer({
    buyerId: buyer,
    sellerId: seller,
    amount: 999_999_999,
    reference: `order-toobig-${stamp}`,
  })
  expect('拒まれた', rejected, false)
  expect('残高が変わっていない', (await mp.getBalance(buyer)).total, before.total)

  console.log('\n=== 期限切れの失効（受け入れ基準 E2）===')
  const expiring = `org-expiring-${stamp}`
  await mp.grantInitialFunds(expiring, 1_000)
  await mp.grantBonus({
    organizationId: expiring,
    amount: 500,
    expiresAt: new Date(Date.now() - 1_000),
    reference: `quiz-old-${stamp}`,
  })
  expect('期限切れは残高に数えない', (await mp.getBalance(expiring)).bonus, 0)
  expect('失効の行を1件作る', await mp.expireBonuses(expiring), 1)
  expect('二度目は作らない', await mp.expireBonuses(expiring), 0)

  console.log('\n=== 市場全体の MP の量 ===')
  const supply = await mp.getSupply()
  console.log(
    `  配った: ${supply.granted} / 失効: ${supply.expired} / 外へ出た: ${supply.spentOutside} / 出回っている: ${supply.circulating}`,
  )
  // 広告費（ad_spend）は企業から市場の外へ出ていくので、失効と同じく引く。
  // ここを忘れると、広告が売れた分だけ MP が消えたように見える。
  expect(
    '出回っている額 = 配った額 − 失効 − 外へ出た額',
    supply.granted - supply.expired - supply.spentOutside,
    supply.circulating,
  )

  console.log('')
  if (failures.length > 0) {
    console.error(`${failures.length} 件が通りませんでした:`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log('すべて通りました。')
}
