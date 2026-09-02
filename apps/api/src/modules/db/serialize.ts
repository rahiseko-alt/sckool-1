/**
 * 「同時に来た書き込みを、1つずつに並べる」ための道具。
 *
 * **なぜ必要か。** 残高も在庫も「読む → 足りるか見る → 書く」の3手で動く。
 * 1人ずつなら正しいが、60社が同時に買うと、読んでから書くまでの間に
 * 別の購入が割り込む。両方とも「足りる」と判断してしまい、
 * 在庫5個の商品が33個売れ、残高が -57,000 MP になった（実際に起きた）。
 *
 * 直し方は2つある。
 *
 *   1. 在庫のように「数を1つ増減するだけ」なら、条件つきの1文で書き換える。
 *      データベースが行に鍵をかけてくれるので、読みと書きの間が無くなる
 *   2. 残高のように「たくさんの行を数えてから決める」なら、1文にできない。
 *      企業ごとの鍵を取り、同じ企業への書き込みを順番待ちにする
 *
 * ここには 2 のための鍵と、そのための型だけを置く。1 は各サービスが直接書く。
 */

/**
 * MikroORM の EntityManager のうち、ここで使う分だけ。
 *
 * Medusa は EntityManager の型を公開していないので、必要な形だけを自分で書く。
 * `execute` の `?` は knex の記法で、値は必ず引数として渡す（文字列を連結しない）。
 */
export interface SqlManager {
  execute(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
}

/** `MedusaService` が持つ `baseRepository_` のうち、ここで使う分だけ。 */
export interface TransactionalRepository {
  transaction<T>(task: (manager: SqlManager) => Promise<T>): Promise<T>
}

/**
 * `MedusaService` が作る `baseRepository_` を取り出す。
 *
 * Medusa の型には出てこない（内部の名前）ので、ここで1回だけ形を決めて使う。
 * サービスのあちこちで型を外すより、入口を1つにしたほうが壊れたときに追いやすい。
 */
export function repositoryOf(service: object): TransactionalRepository {
  const holder = service as { baseRepository_?: TransactionalRepository }
  if (!holder.baseRepository_) {
    throw new Error('baseRepository_ が見つかりません。MedusaService を継承していますか。')
  }
  return holder.baseRepository_
}

/**
 * ある企業への書き込みを、同時に1つだけに絞る（PostgreSQL の advisory lock）。
 *
 * **必ず取引（トランザクション）の中で呼ぶこと。** `xact` の名のとおり、
 * 取引が終わると自動で鍵が外れる。外し忘れで詰まることがない。
 *
 * 鍵は企業ごとなので、別々の企業の購入は今までどおり同時に進む。
 * 待たされるのは「同じ企業が同時に何度も払おうとしたとき」だけ。
 */
export async function lockOrganization(
  manager: SqlManager,
  organizationId: string,
): Promise<void> {
  // hashtext は文字列を整数に潰す。別の企業が同じ整数になることは理屈上ありうるが、
  // その場合に起きるのは「関係ない2社が順番待ちになる」だけで、数字は狂わない。
  await manager.execute('select pg_advisory_xact_lock(hashtext(?)) as locked', [
    `mp:${organizationId}`,
  ])
}
