import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

import { THEME_BOOTSTRAP_SOURCE } from './src/app/design/theme-keys.ts'
import { DEFAULT_PORT, resolveConfig } from './src/server/config.ts'
import { graphApiPlugin } from './src/server/vite-plugin.ts'

/*
 * dev の待ち受けポートも本番と同じ規則で決める（UT-03）。
 *
 * 起動パラメータに不備があってもここでは既定値に落とす。理由付きで止めるのは
 * プラグイン側（`configureServer`）であり、その判定より前にこの評価が走るため。
 * 不備のある値がそのまま使われることはない。
 */
const resolved = resolveConfig([], process.env, process.cwd(), { acceptsArgv: false })
const devPort = resolved.ok ? resolved.config.port : DEFAULT_PORT

/*
 * 記憶したテーマを、最初の描画より前に <html> へ載せる（UT-04）。
 *
 * 画面のコードが属性を載せるのは JS の評価後で、それでは初回描画に間に合わない。
 * 記憶とキー名を二重に持たないよう、本体は theme-keys.ts から読む。
 */
function themeBootstrapPlugin(): Plugin {
  return {
    name: 'depenomap:theme-bootstrap',
    transformIndexHtml: () => [
      { tag: 'script', injectTo: 'head-prepend', children: THEME_BOOTSTRAP_SOURCE },
    ],
  }
}

export default defineConfig({
  // UT-03: dev では Hono を Vite の middleware として載せる（プロセスを分けない）
  plugins: [vue(), tailwindcss(), themeBootstrapPlugin(), graphApiPlugin()],
  server: {
    // dev と本番で同じ URL で開けるようにする
    port: devPort,
    // 塞がっていたら黙って隣のポートへ逃げない。指定したポートで待ち受ける
    // という起動パラメータの約束を dev でも守る（本番は listen 失敗で止まる）
    strictPort: true,
  },
  build: {
    // 本番は Hono がここを静的配信する。サーバーの成果物は dist/server に出す
    outDir: 'dist/client',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // 画面のテストも含めて node で走らせる。いまはどれも DOM を触らず、
    // 触るテスト（UT-05 以降のコンポーネント）が出た時点で環境を足す（ADR-005）
    environment: 'node',
  },
})
