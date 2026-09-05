import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

import { MP_MODULE } from '../../../../modules/mp'
import type MpService from '../../../../modules/mp/service'

/**
 * 売買を取り消す（受け入れ基準 K3）。
 *
 * **消すのではなく、反対向きの行を足す。** 履歴は追記だけで、更新も削除もしない。
 * データベースの側でも止めてある（`Migration20260902140000`）。
 *
 * 判定役に「逆仕訳を作る関数はあるが、動いている仕組みの中から
 * 一度も呼ばれておらず、取り消す手段が1つも無い」と指摘されて足した。
 * 基準は「取り消しは逆仕訳で表す」なので、取り消せること自体が要る。
 *
 * 取り消せるのは先生だけ。`/admin` の下にあるので、生徒のアカウントでは呼べない。
 *
 * 指定するのは**印**（`group_id`）で、行の id ではない。1回の売買は
 * 買う側と売る側の行に分かれており、片方だけ戻すと市場全体の MP の量が狂う。
 */

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { group_id?: unknown }
  const groupId = typeof body.group_id === 'string' ? body.group_id.trim() : ''
  if (!groupId) {
    res.status(400).json({ code: 'group_id_required' })
    return
  }

  const mp = req.scope.resolve(MP_MODULE) as MpService
  const created = await mp.reverseTransfer(groupId)

  if (created === 0) {
    // すでに取り消してある場合と、そんな売買が無い場合を分けて返す。
    // 先生には「押したのに何も起きない」が一番困る。
    res.status(404).json({ code: 'nothing_to_reverse' })
    return
  }

  res.status(201).json({ group_id: groupId, reversed_entries: created })
}
