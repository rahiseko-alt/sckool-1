/**
 * MP 口座の計算部分。**データベースにも HTTP にも触らない純粋な関数**だけを置く。
 *
 * ここを純粋にしてあるのは、残高の計算が仕組み全体の土台だから。
 * 「残高＝取引履歴の合計」（受け入れ基準 B3）が崩れると、売上も利益もランキングも
 * すべて嘘になる。データベースを用意しなくても、この計算だけを何万通りでも試せるようにする。
 *
 * 保存の側（表と読み書き）は service.ts が持つ。
 */

/** 取引の種類。金額の符号ではなく「何が起きたか」を残す。 */
export type EntryKind =
  /** 初期資金の配布（要件3） */
  | 'initial_grant'
  /** テストのボーナス（要件32） */
  | 'bonus_grant'
  /** ボーナスの期限切れ（受け入れ基準 E2） */
  | 'bonus_expired'
  /** 商品を買った */
  | 'purchase'
  /** 商品が売れた */
  | 'sale'
  /** 広告費（要件12） */
  | 'ad_spend'
  /** 取り消しのための逆仕訳（受け入れ基準 K3） */
  | 'reversal';

/** 残高の種類。ボーナスは期限つきで、支払いに先に使われる。 */
export type Pocket = 'normal' | 'bonus';

/**
 * 取引履歴の1行。
 *
 * **一度書いたら変えない。** 取り消しは `reversal` を足して表す（受け入れ基準 K3）。
 * 金額は MP の整数。小数は使わない（受け入れ基準 C3）。
 */
export interface LedgerEntry {
  id: string;
  organizationId: string;
  /** 増えるときは正、減るときは負。 */
  amount: number;
  kind: EntryKind;
  pocket: Pocket;
  /**
   * ボーナスが使えなくなる時刻。`pocket` が `bonus` のときだけ入る。
   * 期限を過ぎた行は残高に数えない（受け入れ基準 E2）。
   */
  expiresAt?: Date;
  /** どの商品・どのテストによるものか。画面に出す相手の企業名などはここから引く。 */
  reference?: string;
  /**
   * ひとつの出来事を指す印。1回の購入がボーナスと通常の2行に分かれるため、
   * 件数を数えるときは行ではなくこれで数える。
   */
  groupId?: string;
  createdAt: Date;
}

export interface Balance {
  /** いつでも使える残高。 */
  normal: number;
  /** まだ期限が切れていないボーナスの残高。 */
  bonus: number;
  /** 支払いに使える合計。 */
  total: number;
}

/**
 * 残高を数えるのに要る分だけ。
 *
 * 支払いの直前は「鍵を取ってから数え直す」ため、履歴を金額・種類・期限だけの
 * 軽い形で読む。1行まるごと読む必要がないので、必要な列だけを求める形にしてある。
 */
export type BalancePart = Pick<LedgerEntry, 'amount' | 'pocket' | 'kind'> &
  Partial<Pick<LedgerEntry, 'id' | 'expiresAt'>>

/** ボーナスを配布ごとに突き合わせた結果。 */
interface BonusSettlement {
  /** いま使えるボーナスの合計。 */
  spendable: number;
  /** 期限が切れていて、まだ失効の行を作っていない分。 */
  unswept: { entryId: string; amount: number }[];
}

/** 期限の早い順に並べるための値。期限が無いものは最後に回す。 */
function expiryOrder(expiresAt: Date | undefined): number {
  return expiresAt ? expiresAt.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * ボーナスを「配布ごとの残り」に突き合わせる。残高と失効の両方がここを使う。
 *
 * **なぜ行ごとに足し引きするだけでは足りないか。**
 * ボーナスの行は3種類ある——配布（正）・使った分（負）・失効（負）。
 * 期限切れかどうかを行ごとに見て足し引きすると、次の2つが同時に狂う。
 *
 *   - 失効の行には期限が入っていないので、期限切れの配布は数えないのに
 *     失効の行だけ数えてしまい、同じ 1,500 MP を二度引く
 *     （実際に残高が「ボーナス −1,500」になった）
 *   - 1,500 のうち 500 を使ったあとに期限が切れると、配布の 1,500 だけが
 *     消えて、使った分の −500 が残る。使っていない通常残高から 500 が減る
 *
 * どちらも「使った分・失効した分が、どの配布を減らしたのか」を見ていないのが原因。
 * ここでは配布を期限の早い順に並べ、負の行をその順に割り当てて「配布ごとの残り」を出す。
 * 期限の早いものから使う並びは、支払いの振り分け（`planPayment`）の考え方と同じ。
 */
function settleBonus(entries: readonly BalancePart[], now: Date): BonusSettlement {
  const grants = entries
    .filter((entry) => entry.pocket === 'bonus' && entry.kind === 'bonus_grant' && entry.amount > 0)
    .map((entry) => ({ id: entry.id, expiresAt: entry.expiresAt, remaining: entry.amount }))
    .sort((a, b) => expiryOrder(a.expiresAt) - expiryOrder(b.expiresAt));

  // 配布以外のボーナスの行（使った分・失効・取り消し）をまとめる。
  // 取り消しは正の値なので、そのぶん割り当てる額が減る。
  let unallocated = -entries
    .filter((entry) => entry.pocket === 'bonus' && entry.kind !== 'bonus_grant')
    .reduce((sum, entry) => sum + entry.amount, 0);

  for (const grant of grants) {
    if (unallocated <= 0) break;
    const taken = Math.min(grant.remaining, unallocated);
    grant.remaining -= taken;
    unallocated -= taken;
  }

  // どの配布にも割り当てられなかった分は、そのまま残高に出す。
  // 隠すと「残高＝履歴の合計」（受け入れ基準 B3）が崩れて、狂いに気づけなくなる。
  // `0 -` から始めるのは `-0` を作らないため。画面に「-0 MP」と出る。
  let spendable = 0 - unallocated;
  const unswept: BonusSettlement['unswept'] = [];

  for (const grant of grants) {
    if (grant.remaining <= 0) continue;
    if (expiryOrder(grant.expiresAt) > now.getTime()) {
      spendable += grant.remaining;
      continue;
    }
    if (grant.id !== undefined) unswept.push({ entryId: grant.id, amount: grant.remaining });
  }

  return { spendable, unswept };
}

/**
 * ある時点での残高を、取引履歴だけから数える。
 *
 * **保存された残高の値は使わない。** 二重に持つと必ずずれるため、
 * 残高は常にここで数え直す（受け入れ基準 B3）。
 */
export function calculateBalance(entries: readonly BalancePart[], now: Date = new Date()): Balance {
  let normal = 0;

  for (const entry of entries) {
    if (entry.pocket === 'normal') normal += entry.amount;
  }

  const bonus = settleBonus(entries, now).spendable;

  return { normal, bonus, total: normal + bonus };
}

/** 支払いを、どの残高からいくら引くかに分けた結果。 */
export interface PaymentPlan {
  fromBonus: number;
  fromNormal: number;
}

/**
 * 支払いを「ボーナスから先に、足りない分を通常から」に振り分ける（受け入れ基準 E1）。
 *
 * 生徒にどちらを使うか選ばせない。期限つきのボーナスを先に使わないと、
 * 使わないまま消えて「損した」という体験になる。
 *
 * 残高が足りないときは `undefined` を返す。**呼ぶ側は必ずこれを見ること。**
 */
export function planPayment(balance: Balance, amount: number): PaymentPlan | undefined {
  if (!Number.isInteger(amount) || amount <= 0) return undefined;
  if (amount > balance.total) return undefined;

  const fromBonus = Math.min(balance.bonus, amount);
  return { fromBonus, fromNormal: amount - fromBonus };
}

/**
 * 期限が切れたボーナスについて、失効の行を作る材料を返す。
 *
 * 期限切れを「数えない」だけにすると履歴と残高が食い違って見えるので、
 * 失効も1行として残す（受け入れ基準 E2）。
 *
 * 返すのは**配布額ではなく使い残し**。すでに失効させた分は残りが 0 になるので、
 * 二度呼んでも二度目は空になる（`settleBonus` が両方をまとめて面倒を見る）。
 */
export function findExpiredBonuses(
  entries: readonly BalancePart[],
  now: Date = new Date(),
): { entryId: string; amount: number }[] {
  return settleBonus(entries, now).unswept;
}

/**
 * 取り消しのための逆仕訳を作る。
 *
 * 元の行は消さない。反対向きの行を足すことで、履歴を見れば
 * 「何が起きて、何を取り消したか」が両方わかる（受け入れ基準 K3）。
 */
export function buildReversal(
  entry: LedgerEntry,
  id: string,
  now: Date = new Date(),
): LedgerEntry {
  return {
    id,
    organizationId: entry.organizationId,
    amount: -entry.amount,
    kind: 'reversal',
    pocket: entry.pocket,
    ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
    reference: entry.id,
    // 元の売買と同じ印を引き継ぐ。**引き継がないと、買った側と売った側の
    // 取り消しが別々の出来事に見え、二重に取り消したかどうかも分からなくなる。**
    ...(entry.groupId ? { groupId: entry.groupId } : {}),
    createdAt: now,
  };
}

/**
 * 企業と企業のあいだで MP を動かすときの、両側の行を作る（受け入れ基準 D1）。
 *
 * **必ず2行を1組で作る。** 片方だけが残ると、市場全体の MP の総量が変わってしまう。
 * 実際に1つの処理としてまとめるのは service.ts の役目。
 *
 * 受け取る側は必ず通常残高に入る。ボーナスは他社へ移らない（受け入れ基準 E6）。
 */
export function buildTransfer(input: {
  buyerId: string;
  sellerId: string;
  plan: PaymentPlan;
  reference: string;
  /** この購入ひとつを指す印。買う側の行と売る側の行に同じ値を入れる。 */
  groupId: string;
  idFor: (index: number) => string;
  now?: Date;
}): LedgerEntry[] {
  const now = input.now ?? new Date();
  const entries: LedgerEntry[] = [];
  let index = 0;

  if (input.plan.fromBonus > 0) {
    entries.push({
      id: input.idFor(index++),
      organizationId: input.buyerId,
      amount: -input.plan.fromBonus,
      kind: 'purchase',
      pocket: 'bonus',
      reference: input.reference,
      groupId: input.groupId,
      createdAt: now,
    });
  }
  if (input.plan.fromNormal > 0) {
    entries.push({
      id: input.idFor(index++),
      organizationId: input.buyerId,
      amount: -input.plan.fromNormal,
      kind: 'purchase',
      pocket: 'normal',
      reference: input.reference,
      groupId: input.groupId,
      createdAt: now,
    });
  }

  entries.push({
    id: input.idFor(index++),
    organizationId: input.sellerId,
    amount: input.plan.fromBonus + input.plan.fromNormal,
    kind: 'sale',
    pocket: 'normal',
    reference: input.reference,
    groupId: input.groupId,
    createdAt: now,
  });

  return entries;
}

/**
 * 市場全体で MP の総量が保たれているかを調べる。
 *
 * 増えてよいのは配布（初期資金・ボーナス）だけ。減ってよいのは失効
 * （`bonus_expired`）と、市場の外へ出ていく支払い（広告費 `ad_spend`）だけ。
 * 売り買いは企業から企業への移動なので総量を変えない。
 *
 * つまり `circulating = granted − expired − spentOutside` が必ず成り立つ。
 * ここがずれたら、どこかで片側だけの行を書いている（受け入れ基準 K1 の検査に使う）。
 *
 * **広告費を数え忘れると、広告が売れた分だけ MP が消えたように見える。**
 * 実際、広告の検査を先に走らせてから MP の検査を走らせると 73,500 MP 合わなくなった。
 */
export function calculateSupply(entries: readonly LedgerEntry[]): {
  granted: number;
  expired: number;
  /** 広告費など、企業から市場の外へ出ていった額（正の数）。 */
  spentOutside: number;
  circulating: number;
} {
  let granted = 0;
  let expired = 0;
  let spentOutside = 0;
  let circulating = 0;

  for (const entry of entries) {
    circulating += entry.amount;
    if (entry.kind === 'initial_grant' || entry.kind === 'bonus_grant') granted += entry.amount;
    if (entry.kind === 'bonus_expired') expired += -entry.amount;
    if (entry.kind === 'ad_spend') spentOutside += -entry.amount;
  }

  return { granted, expired, spentOutside, circulating };
}
