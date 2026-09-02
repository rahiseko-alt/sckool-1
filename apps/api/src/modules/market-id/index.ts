import { randomInt, scryptSync, randomBytes, timingSafeEqual } from 'crypto'

/**
 * 匿名アカウントの識別子（Market ID）と、パスワードを作り直すための Recovery Code。
 *
 * この仕組みは生徒の個人情報を持たない（要件35）。そのため、
 * 「誰のアカウントか」を示すものは Market ID しかなく、パスワードを忘れたときに
 * メールを送ることもできない（要件36）。Recovery Code はその代わり。
 *
 * ここは純粋な関数だけを置く。データベースにも HTTP にも触らない。
 */

/**
 * 使う文字。**紛らわしい 0 O 1 I を外してある。**
 * 生徒は紙に書き写して持ち歩くため、読み違いが起きると本人でも入れなくなる。
 */
export const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Market ID の形。`MKT-` の後ろに4文字ずつ2組。 */
const MARKET_ID_GROUPS = 2
/** Recovery Code の形。4文字ずつ3組（Market ID より当てにくくする）。 */
const RECOVERY_CODE_GROUPS = 3
const GROUP_LENGTH = 4

/**
 * 暗号として安全な乱数で1文字選ぶ。
 * `Math.random()` を使わないのは、Recovery Code を推測されると
 * 他人のアカウントのパスワードを変えられてしまうため。
 */
function randomChar(): string {
  return ID_ALPHABET[randomInt(ID_ALPHABET.length)]!
}

function randomGroups(groups: number): string {
  return Array.from({ length: groups }, () =>
    Array.from({ length: GROUP_LENGTH }, randomChar).join(''),
  ).join('-')
}

/** `MKT-7F4K-29QX` の形の Market ID を1つ作る。 */
export function generateMarketId(): string {
  return `MKT-${randomGroups(MARKET_ID_GROUPS)}`
}

/** `8GHD-X19P-K7QT` の形の Recovery Code を1つ作る。 */
export function generateRecoveryCode(): string {
  return randomGroups(RECOVERY_CODE_GROUPS)
}

/** 見た目が Market ID の形になっているか。 */
export function isMarketId(value: string): boolean {
  return new RegExp(
    `^MKT-[${ID_ALPHABET}]{${GROUP_LENGTH}}-[${ID_ALPHABET}]{${GROUP_LENGTH}}$`,
  ).test(value)
}

/** 見た目が Recovery Code の形になっているか。 */
export function isRecoveryCode(value: string): boolean {
  const group = `[${ID_ALPHABET}]{${GROUP_LENGTH}}`
  return new RegExp(`^${group}-${group}-${group}$`).test(value)
}

/**
 * 入力のゆらぎを吸収する。小文字で書かれても、区切りを抜かしても通す。
 * 紙から打ち直す前提なので、ここで厳しくすると本人が入れなくなる。
 */
export function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[\s-]/g, '')
}

const SCRYPT_KEY_LENGTH = 64
const SALT_LENGTH = 16

/**
 * Recovery Code を保存できる形にする。
 *
 * **平文では絶対に保存しない**（受け入れ基準 A1）。データベースが漏れたときに
 * 全員のパスワードを変えられてしまうため。パスワードと同じ強さの扱いにする。
 *
 * 返す形は `salt:hash`（どちらも16進）。
 */
export function hashRecoveryCode(code: string, salt = randomBytes(SALT_LENGTH)): string {
  const derived = scryptSync(normalizeCode(code), salt, SCRYPT_KEY_LENGTH)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

/**
 * 入力された Recovery Code が、保存してあるものと一致するか。
 *
 * 比較に `timingSafeEqual` を使うのは、応答の速さの差から
 * 正解の文字数や先頭が漏れないようにするため。
 */
export function verifyRecoveryCode(code: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false

  let expected: Buffer
  try {
    expected = Buffer.from(hashHex, 'hex')
  } catch {
    return false
  }
  if (expected.length !== SCRYPT_KEY_LENGTH) return false

  const actual = scryptSync(normalizeCode(code), Buffer.from(saltHex, 'hex'), SCRYPT_KEY_LENGTH)
  return timingSafeEqual(actual, expected)
}

/**
 * 匿名アカウントに割り当てる、機械が作ったメールアドレス。
 *
 * Medusa の一部のテーブルは `email` を必須にしており、列そのものは消せない。
 * 人が入力した値が混ざらないよう、**Market ID から機械的に作った値だけ**を入れる。
 * 経緯は docs/decisions.md「30.」。`scripts/check-no-personal-data.mjs` は
 * この形の値だけを通す。
 */
export function anonymousEmail(marketId: string): string {
  return `${marketId}@anon.invalid`
}
