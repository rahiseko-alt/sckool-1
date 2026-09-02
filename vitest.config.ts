import { defineConfig } from 'vitest/config';

/**
 * ルートのテストは `src/` だけを見る。
 *
 * `apps/` は Mercur 由来のアプリで、Jest（Medusa の作法）で動く別系統のテストを持つ。
 * 既定の include のままだと vitest がそれらを拾い、土台の検査が上物の都合で落ちる。
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
