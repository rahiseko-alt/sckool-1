import { MedusaService } from '@medusajs/framework/utils'

import { checkName, nameKey, normalizeName, type NameProblem } from './name'
import { Organization } from './models/organization'

/** 企業を作る・名前を変えるときの結果。うまくいったか、なぜ駄目だったか。 */
export type OrganizationResult =
  | { ok: true; organization: { id: string; market_id: string; name: string } }
  | { ok: false; problem: NameProblem | 'name_taken' | 'not_found' }

/**
 * 仮想企業の登録と名前の管理（受け入れ基準 B1）。
 *
 * 名前の重複はデータベース側の一意制約でも守っているが、
 * ここでも先に見る。**制約に任せきりだと、利用者に返せるのは
 * 「保存に失敗しました」だけ**で、どう直せばよいか伝わらない。
 */
class OrganizationService extends MedusaService({ Organization }) {
  /** 見た目が同じ名前が既にあるか。大文字小文字と全角半角の違いは同じ名前とみなす。 */
  private async findByNameKey(key: string, exceptId?: string) {
    const all = await this.listOrganizations({})
    return all.find(
      (organization) => nameKey(organization.name) === key && organization.id !== exceptId,
    )
  }

  /** アカウント作成と同時に企業を1社作る。 */
  async createFor(marketId: string, rawName: string): Promise<OrganizationResult> {
    const problem = checkName(rawName)
    if (problem) return { ok: false, problem }

    const name = normalizeName(rawName)
    if (await this.findByNameKey(nameKey(name))) {
      return { ok: false, problem: 'name_taken' }
    }

    const created = await this.createOrganizations({ market_id: marketId, name })
    return {
      ok: true,
      organization: { id: created.id, market_id: created.market_id, name: created.name },
    }
  }

  /** 企業名を変える。後から変えられることは要件で決まっている（受け入れ基準 B1）。 */
  async rename(marketId: string, rawName: string): Promise<OrganizationResult> {
    const problem = checkName(rawName)
    if (problem) return { ok: false, problem }

    const [existing] = await this.listOrganizations({ market_id: marketId })
    if (!existing) return { ok: false, problem: 'not_found' }

    const name = normalizeName(rawName)
    if (await this.findByNameKey(nameKey(name), existing.id)) {
      return { ok: false, problem: 'name_taken' }
    }

    const updated = await this.updateOrganizations({ id: existing.id, name })
    const organization = Array.isArray(updated) ? updated[0] : updated
    return {
      ok: true,
      organization: {
        id: organization.id,
        market_id: organization.market_id,
        name: organization.name,
      },
    }
  }

  /** Market ID から企業を引く。 */
  async findByMarketId(marketId: string) {
    const [organization] = await this.listOrganizations({ market_id: marketId })
    return organization
  }

  /**
   * その名前が既に使われているか。アカウントを作る前に見るために公開している。
   *
   * 作ってから名前で失敗すると、認証だけできて企業が無いアカウントが残ってしまう。
   */
  async findByNameKeyPublic(rawName: string) {
    return this.findByNameKey(nameKey(rawName))
  }
}

export default OrganizationService
