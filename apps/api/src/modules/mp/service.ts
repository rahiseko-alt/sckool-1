import { MedusaService } from '@medusajs/framework/utils'

import { lockOrganization, repositoryOf, type SqlManager } from '../db/serialize'
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
      ...(row.group_id ? { groupId: row.group_id } : {}),
      createdAt: new Date(row.created_at),
    }
  }

  /** ある企業の履歴を全て読む。 */
  async listEntriesFor(organizationId: string): Promise<LedgerEntry[]> {
    const rows = await this.listMpLedgerEntries({ organization_id: organizationId })
    return rows.map((row) => this.toLedgerEntry(row))
  }

  /**
   * 支払いの前に、鍵を取ってから残高を数える。
   *
   * **鍵を取ったあとに数え直すことが肝。** 順番待ちで先に進んだ購入が
   * すでに書き終えているので、待たされた側は「減ったあとの残高」を見る。
   * 鍵の前に数えると、待った意味が無くなる。
   */
  private async balanceUnderLock(
    manager: SqlManager,
    organizationId: string,
    now: Date,
  ): Promise<Balance> {
    await lockOrganization(manager, organizationId)

    const rows = await manager.execute(
      `select "amount", "pocket", "expires_at"
         from "mp_ledger_entry"
        where "organization_id" = ? and "deleted_at" is null`,
      [organizationId],
    )

    return calculateBalance(
      rows.map((row) => ({
        amount: Number(row.amount),
        pocket: row.pocket as Pocket,
        ...(row.expires_at ? { expiresAt: new Date(row.expires_at as string) } : {}),
      })),
      now,
    )
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
        group_id: null,
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
        // ボーナスは1行なので、その行自身がひとつの出来事。
        group_id: null,
      },
    ])
  }

  /**
   * 企業から企業へ MP を移す（受け入れ基準 D1・D3・E1）。
   *
   * 残高が足りなければ `false` を返し、**1行も書かない**。
   * 買った側と売った側の行は必ず同じ呼び出しで作る。
   *
   * **「数える → 足りるか見る → 書く」を、払う企業ごとに順番待ちにしてある。**
   * 順番待ちにしないと、同じ企業の購入が同時に来たときに両方とも「足りる」と
   * 判断してしまう。60社で同時に試したとき、残高が -57,000 MP になった
   * （`scripts/check-load.mjs` が見つけた）。鍵は払う側だけで足りる。
   * 受け取る側は増えるだけなので、負にはならない。
   */
  async transfer(input: {
    buyerId: string
    sellerId: string
    amount: number
    reference: string
    /** この購入ひとつを指す印。省くと自動で作る。 */
    groupId?: string
    now?: Date
  }): Promise<boolean> {
    const now = input.now ?? new Date()

    return repositoryOf(this).transaction(async (manager) => {
      const balance = await this.balanceUnderLock(manager, input.buyerId, now)
      const plan = planPayment(balance, input.amount)
      if (!plan) return false

      // id は保存側が振るので、ここでは並び順だけを決める。
      // 1回の購入がボーナスと通常の2行に分かれるので、まとめて数えるための印を作る。
      const groupId =
        input.groupId ?? `grp_${now.getTime()}_${Math.random().toString(36).slice(2, 10)}`

      const entries = buildTransfer({
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        plan,
        reference: input.reference,
        groupId,
        idFor: () => '',
        now,
      })

      // 鍵と同じ取引（トランザクション）の中で書く。別にすると、
      // 書き終える前に鍵が外れて、また同時に判断されてしまう。
      await this.createMpLedgerEntries(
        entries.map((entry) => ({
          organization_id: entry.organizationId,
          amount: entry.amount,
          kind: entry.kind,
          pocket: entry.pocket,
          expires_at: entry.expiresAt ?? null,
          reference: entry.reference ?? null,
          group_id: entry.groupId ?? null,
        })),
        { transactionManager: manager },
      )
      return true
    })
  }

  /**
   * 広告費など、企業から市場の外へ出ていく支払い。
   *
   * 購入と同じく、払う企業ごとの順番待ちにする。広告と購入が同時に来ても、
   * 同じ鍵を取り合うので、合わせて残高を超えることはない。
   */
  async spend(input: {
    organizationId: string
    amount: number
    kind: Extract<EntryKind, 'ad_spend'>
    reference: string
    now?: Date
  }): Promise<boolean> {
    const now = input.now ?? new Date()

    return repositoryOf(this).transaction(async (manager) => {
      const balance = await this.balanceUnderLock(manager, input.organizationId, now)
      const plan = planPayment(balance, input.amount)
      if (!plan) return false

      // 広告費もボーナスと通常に分かれることがあるので、同じ印を付ける。
      const spendGroupId = `grp_${now.getTime()}_${Math.random().toString(36).slice(2, 10)}`

      const rows = []
      if (plan.fromBonus > 0) {
        rows.push({
          organization_id: input.organizationId,
          amount: -plan.fromBonus,
          kind: input.kind,
          pocket: 'bonus' as const,
          expires_at: null,
          reference: input.reference,
          group_id: spendGroupId,
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
          group_id: spendGroupId,
        })
      }
      await this.createMpLedgerEntries(rows, { transactionManager: manager })
      return true
    })
  }

  /**
   * 期限が切れたボーナスを失効させる（受け入れ基準 E2）。
   * 失効も履歴に1行として残すので、あとから「いつ消えたか」を追える。
   */
  async expireBonuses(organizationId: string, now = new Date()): Promise<number> {
    // 支払いと同じ鍵を取る。取らないと、同時に呼ばれたときに同じボーナスを
    // 二度失効させ、残高が実際より減ってしまう。
    return repositoryOf(this).transaction(async (manager) => {
      await lockOrganization(manager, organizationId)

      // 読みも同じ取引の中で行う。別に読むと接続をもう1本使うので、
      // 同時に多くの企業が失効させたときに接続が足りなくなる。
      const rows = await manager.execute(
        `select "id", "amount", "kind", "pocket", "expires_at", "reference", "created_at"
           from "mp_ledger_entry"
          where "organization_id" = ? and "deleted_at" is null`,
        [organizationId],
      )
      const expired = findExpiredBonuses(
        rows.map((row) => this.toLedgerEntry({ ...row, organization_id: organizationId })),
        now,
      )
      if (expired.length === 0) return 0

      await this.createMpLedgerEntries(
        expired.map((item) => ({
          organization_id: organizationId,
          amount: -item.amount,
          kind: 'bonus_expired' as const,
          pocket: 'bonus' as const,
          expires_at: null,
          reference: item.entryId,
          group_id: null,
        })),
        { transactionManager: manager },
      )
      return expired.length
    })
  }

  /** 市場全体で MP の総量が保たれているかを見る（受け入れ基準 K1 の検査に使う）。 */
  async getSupply(): Promise<{
    granted: number
    expired: number
    spentOutside: number
    circulating: number
  }> {
    const rows = await this.listMpLedgerEntries({})
    return calculateSupply(rows.map((row) => this.toLedgerEntry(row)))
  }
}

export default MpService
