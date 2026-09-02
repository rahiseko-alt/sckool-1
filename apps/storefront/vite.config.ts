import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * 生徒が見る画面。
 *
 * バックエンドの場所と公開鍵は環境変数で渡す。既定はこの実行環境の開発用。
 * 公開鍵は Store API を呼ぶのに必ず要る（無いと全て 400）。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      __BACKEND_URL__: JSON.stringify(env.VITE_BACKEND_URL || 'http://localhost:9000'),
      __PUBLISHABLE_KEY__: JSON.stringify(env.VITE_PUBLISHABLE_KEY || ''),
    },
  }
})
