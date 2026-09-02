import { MedusaService } from '@medusajs/framework/utils'

import {
  buildTransfer,
  calculateBalance,
  calculateSupply,
  findExpiredBonuses,
  planPayment,
  type Balance,
  type EntryKind,
  type LedgerEntry,
  type Pocket,
} from './ledger'
import { MpLedgerEntry } from './models/ledger-entry'

/**
 * MP 口座の保存と読み出し。計算そのものは ledger.ts が持つ。
 *
 * ここが守ること:
 *   - 履歴は**足すだけ**。更新と削除の入口を作らない（受け入れ基準 K3）
 *   - 残高は毎回履歴から数える。保存しない（同 B3）
 *   - 企業から企業への移動は**両側の行を1つの処理でまとめて**書く（同 D1）
 */
class MpService extends MedusaService({ MpLedgerEntry }) {
  /** 保存されている行を、計算に使う形に直す。 */
  private toLedgerEntry(row: any): LedgerEntry {
    return {
      id: row.id,
      organizationId: row.organization_id,
      amount: Number(row.amount),
      kind: row.kind as EntryKind,
      pocket: row.pocket as Pocket,
      ...(row.expires_at ? { expiresAt: new Date(row.expires_at) } : {}),
      ...(row.reference ? { reference: row.reference } : {}),
      createdAt: new Date(row.created_at),
    }
  }

  /** ある企業の履歴を全て読む。 */
  async listEntriesFor(organizationId: string): Promise<LedgerEntry[]> {
    const rows = await this.listMpLedgerEntries({ organization_id: organizationId })
    return rows.map((row) => this.toLedgerEntry(row))
  }

  /**
   * 残高を数える（受け入れ基準 B3・G1）。
   * 保存された値ではなく、そのつど履歴から数える。
   */
  async getBalance(organizationId: string, now = new Date()): Promise<Balance> {
    return calculateBalance(await this.listEntriesFor(organizationId), now)
  }

  /** 初期資金を配る（受け入れ基準 B2）。 */
  async grantInitialFunds(organizationId: string, amount: number): Promise<void> {
    await this.createMpLedgerEntries([
      {
        organization_id: organizationId,
        amount,
        kind: 'initial_grant',
        pocket: 'normal',
        reference: null,
        expires_at: null,
      },
    ])
  }

  /**
   * テストのボーナスを配る（受け入れ基準 E3・E5）。
   * 同じテストから二度配らないための判定は、呼ぶ側（採点の処理）が行う。
   */
  async grantBonus(input: {
    organizationId: string
    amount: number
    expiresAt: Date
    reference: string
  }): Promise<void> {
    await this.createMpLedgerEntries([
      {
        organization_id: input.organizationId,
        amount: input.amount,
        kind: 'bonus_grant',
        pocket: 'bonus',
        expires_at: input.expiresAt,
        reference: input.reference,
      },
    ])
  }

  /**
   * 企業から企業へ MP を移す（受け入れ基準 D1・D3・E1）。
   *
   * 残高が足りなければ `false` を返し、**1行も書かない**。
   * 買った側と売った側の行は必ず同じ呼び出しで作る。
   */
  async transfer(input: {
    buyerId: string
    sellerId: string
    amount: number
    reference: string
    now?: Date
  }): Promise<boolean> {
    const now = input.now ?? new Date()
    const balance = await this.getBalance(input.buyerId, now)
    const plan = planPayment(balance, input.amount)
    if (!plan) return false

    // id は保存側が振るので、ここでは並び順だけを決める。
    const entries = buildTransfer({
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      plan,
      reference: input.reference,
      idFor: () => '',
      now,
    })

    await this.createMpLedgerEntries(
      entries.map((entry) => ({
        organization_id: entry.organizationId,
        amount: entry.amount,
        kind: entry.kind,
        pocket: entry.pocket,
        expires_at: entry.expiresAt ?? null,
        reference: entry.reference ?? null,
      })),
    )
    return true
  }

  /** 広告費など、企業から市場の外へ出ていく支払い。 */
  async spend(input: {
    organizationId: string
    amount: number
    kind: Extract<EntryKind, 'ad_spend'>
    reference: string
    now?: Date
  }): Promise<boolean> {
    const now = input.now ?? new Date()
    const balance = await this.getBalance(input.organizationId, now)
    const plan = planPayment(balance, input.amount)
    if (!plan) return false

    const rows = []
    if (plan.fromBonus > 0) {
      rows.push({
        organization_id: input.organizationId,
        amount: -plan.fromBonus,
        kind: input.kind,
        pocket: 'bonus' as const,
        expires_at: null,
        reference: input.reference,
      })
    }
    if (plan.fromNormal > 0) {
      rows.push({
        organization_id: input.organizationId,
        amount: -plan.fromNormal,
        kind: input.kind,
        pocket: 'normal' as const,
        expires_at: null,
        reference: input.reference,
      })
    }
    await this.createMpLedgerEntries(rows)
    return true
  }

  /**
   * 期限が切れたボーナスを失効させる（受け入れ基準 E2）。
   * 失効も履歴に1行として残すので、あとから「いつ消えたか」を追える。
   */
  async expireBonuses(organizationId: string, now = new Date()): Promise<number> {
    const entries = await this.listEntriesFor(organizationId)
    const expired = findExpiredBonuses(entries, now)
    if (expired.length === 0) return 0

    await this.createMpLedgerEntries(
      expired.map((item) => ({
        organization_id: organizationId,
        amount: -item.amount,
        kind: 'bonus_expired' as const,
        pocket: 'bonus' as const,
        expires_at: null,
        reference: item.entryId,
      })),
    )
    return expired.length
  }

  /** 市場全体で MP の総量が保たれているかを見る（受け入れ基準 K1 の検査に使う）。 */
  async getSupply(): Promise<{ granted: number; expired: number; circulating: number }> {
    const rows = await this.listMpLedgerEntries({})
    return calculateSupply(rows.map((row) => this.toLedgerEntry(row)))
  }
}

export default MpService
