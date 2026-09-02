import { defineConfig } from 'vitest/config';

/**
 * ルートのテストが見る範囲。
 *
 * - `src/` … 雛形から引き継いだ計画まわりのコード
 * - `apps/api/src/` … このプロジェクトのバックエンド。**自分で書いた部分だけ**
 * - `apps/storefront/src/` … 生徒が見る画面。翻訳の突き合わせ（受け入れ基準 I2）を含む
 *
 * `apps/api/integration-tests/` は Medusa の作法（Jest）で動く別系統なので入れない。
 * 既定の include のままだとそれらを拾い、土台の検査が上物の都合で落ちる。
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'apps/api/src/**/*.test.ts', 'apps/storefront/src/**/*.test.ts'],
  },
});
