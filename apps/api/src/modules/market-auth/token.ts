/**
 * 「いま操作しているのがどの企業か」を合鍵から読み取る（受け入れ基準 A2 の続き）。
 *
 * **企業の id を、送られてきた本文から受け取ってはいけない。** 受け取ると、
 * ログインしていない誰かが他社の Market ID を名乗るだけで、その会社の残高を使って
 * 買い物ができてしまう。実際にそう作ってしまい、あとから直した
 * （`docs/decisions.md`「37.」／`docs/failure-action-log.md`）。
 *
 * ここには**合鍵の中身を読む純粋な関数**だけを置く。署名の検証は
 * `api/middlewares.ts` が行う（秘密の値を扱うため）。
 */

/** `Authorization: Bearer xxx` から合鍵だけを取り出す。 */
export function readBearer(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
}

/**
 * 合鍵の中身から Market ID を取り出す。
 *
 * **生徒の合鍵でなければ受け付けない。** 運営者（`user`）の合鍵で生徒の画面を
 * 操作できると、「誰がやったか」が履歴から分からなくなる。
 */
export function marketIdFromPayload(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined;

  const claims = payload as { actor_type?: unknown; app_metadata?: unknown };
  if (claims.actor_type !== 'customer') return undefined;

  const metadata = claims.app_metadata;
  if (metadata === null || typeof metadata !== 'object') return undefined;

  const marketId = (metadata as { market_id?: unknown }).market_id;
  if (typeof marketId !== 'string') return undefined;

  const trimmed = marketId.trim().toUpperCase();
  return trimmed === '' ? undefined : trimmed;
}

/** 経路の中から「いまの企業」を読む。middleware が入れた値だけを見る。 */
export function marketIdOf(req: unknown): string {
  if (req === null || typeof req !== 'object') return '';
  const value = (req as { market_id?: unknown }).market_id;
  return typeof value === 'string' ? value : '';
}
