import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

import { themeBootstrapPlugin } from './src/app/design/theme-bootstrap.node.ts'
import { DEFAULT_HOST, DEFAULT_PORT, resolveConfig } from './src/server/config.ts'
import { graphApiPlugin } from './src/server/vite-plugin.ts'

/*
 * dev の待ち受け先も本番と同じ規則で決める（UT-03 / UT-20）。
 *
 * 起動パラメータに不備があってもここでは既定値に落とす。理由付きで止めるのは
 * プラグイン側（`configureServer`）であり、その判定より前にこの評価が走るため。
 * 不備のある値がそのまま使われることはない。
 */
const resolved = resolveConfig([], process.env, process.cwd(), { acceptsArgv: false })
const devPort = resolved.ok ? resolved.config.port : DEFAULT_PORT
const devHost = resolved.ok ? resolved.config.host : DEFAULT_HOST

export default defineConfig({
  // UT-03: dev では Hono を Vite の middleware として載せる（プロセスを分けない）
  plugins: [vue(), tailwindcss(), themeBootstrapPlugin(), graphApiPlugin()],
  server: {
    // dev と本番で同じ URL で開けるようにする
    port: devPort,
    // 待ち受ける宛先も本番と同じ既定（ループバックだけ）にする。渡した
    // DEPENOMAP_HOST が dev でだけ黙って無視される、という形を作らない（UT-20）
    host: devHost,
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
    // 既定は node。DOM が要るテスト（コンポーネント）は、ファイル先頭の
    // `@vitest-environment jsdom` で個別に切り替える（ADR-005）
    environment: 'node',
  },
})
