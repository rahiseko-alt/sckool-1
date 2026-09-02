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
  /** どの注文・どのテストによるものか。画面に出す相手の企業名などはここから引く。 */
  reference?: string;
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
 * ある時点での残高を、取引履歴だけから数える。
 *
 * **保存された残高の値は使わない。** 二重に持つと必ずずれるため、
 * 残高は常にここで数え直す（受け入れ基準 B3）。
 */
export function calculateBalance(entries: readonly LedgerEntry[], now: Date = new Date()): Balance {
  let normal = 0;
  let bonus = 0;

  for (const entry of entries) {
    if (entry.pocket === 'normal') {
      normal += entry.amount;
      continue;
    }
    // 期限切れのボーナスは数えない。失効の行（bonus_expired）は
    // 履歴に残っているので、合計としてはここで引かれた形になる。
    if (entry.expiresAt && entry.expiresAt.getTime() <= now.getTime()) continue;
    bonus += entry.amount;
  }

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
 */
export function findExpiredBonuses(
  entries: readonly LedgerEntry[],
  now: Date = new Date(),
): { entryId: string; amount: number }[] {
  /** すでに失効させたものを二重に失効させないための目印。 */
  const alreadyExpired = new Set(
    entries.filter((e) => e.kind === 'bonus_expired' && e.reference).map((e) => e.reference!),
  );

  return entries
    .filter(
      (entry) =>
        entry.pocket === 'bonus' &&
        entry.amount > 0 &&
        entry.expiresAt !== undefined &&
        entry.expiresAt.getTime() <= now.getTime() &&
        !alreadyExpired.has(entry.id),
    )
    .map((entry) => ({ entryId: entry.id, amount: entry.amount }));
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
    createdAt: now,
  });

  return entries;
}

/**
 * 市場全体で MP の総量が保たれているかを調べる。
 *
 * 増えてよいのは配布（初期資金・ボーナス）だけ、減ってよいのは失効だけ。
 * 売り買いは移動なので総量を変えない。ここがずれたら、どこかで片側だけの
 * 行を書いている（受け入れ基準 K1 の検査に使う）。
 */
export function calculateSupply(entries: readonly LedgerEntry[]): {
  granted: number;
  expired: number;
  circulating: number;
} {
  let granted = 0;
  let expired = 0;
  let circulating = 0;

  for (const entry of entries) {
    circulating += entry.amount;
    if (entry.kind === 'initial_grant' || entry.kind === 'bonus_grant') granted += entry.amount;
    if (entry.kind === 'bonus_expired') expired += -entry.amount;
  }

  return { granted, expired, circulating };
}
