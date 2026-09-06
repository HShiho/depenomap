/**
 * 本番の起動口。画面（ビルド済みの静的ファイル）と `/api/graph` を 1 つの
 * サーバーから配信する。
 *
 * dev（Vite の middleware）と本番で**アプリ本体は同じ** `app.ts` を使い、
 * ここが足すのは静的配信と待ち受けだけである。
 */

import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

import { createApp } from './app'
import { GRAPH_PATH_ENV, PORT_ENV, resolveConfig } from './config'

const USAGE = [
  '使い方: node dist/server/main.js --graph <正本 JSON のパス> [--port <ポート>]',
  '',
  `  --graph  正本 JSON のパス（環境変数 ${GRAPH_PATH_ENV} でも指定できる）`,
  `  --port   待ち受けポート（環境変数 ${PORT_ENV} でも指定できる）`,
].join('\n')

/**
 * ビルド済みの画面の位置。この実行ファイルからの相対で求める。
 * どの作業ディレクトリから起動しても同じ場所を指すようにするため
 */
const clientDir = fileURLToPath(new URL('../client', import.meta.url))

const resolved = resolveConfig(process.argv.slice(2), process.env, process.cwd())
if (!resolved.ok) {
  console.error('起動パラメータに問題がある。')
  for (const message of resolved.messages) console.error(`  - ${message}`)
  console.error('')
  console.error(USAGE)
  process.exit(1)
}
const config = resolved.config

if (!existsSync(clientDir)) {
  console.error(`画面のビルド結果が見つからない: ${clientDir}`)
  console.error('先に `pnpm build` を実行する。')
  process.exit(1)
}

const app = createApp(config)

/*
 * 静的配信は API を登録したあとに置く。`/api/graph` を先に引き当てるためである。
 *
 * `serveStatic` の `root` は作業ディレクトリからの相対でしか受け付けないため、
 * 絶対パスから畳み直す。
 */
const root = relative(process.cwd(), clientDir) || '.'
app.use('/*', serveStatic({ root }))

/*
 * どのファイルにも当たらない要求には `index.html` を返す。画面は単一ページであり、
 * 直接 URL を叩かれても画面が出る形にしておく。
 */
app.get('*', serveStatic({ root, path: 'index.html' }))

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`depenomap: http://localhost:${info.port}`)
  console.log(`  正本 JSON: ${config.graphPath}`)
})
