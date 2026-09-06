/**
 * 本番の起動口。画面（ビルド済みの静的ファイル）と `/api/graph` を 1 つの
 * サーバーから配信する。
 *
 * dev（Vite の middleware）と本番で**アプリ本体は同じ** `app.ts` を使い、
 * ここが足すのは起動パラメータの解釈と待ち受けだけである。
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { serve } from '@hono/node-server'

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

const app = createApp(config, { clientDir })

/*
 * **ループバックだけで待ち受ける。**
 *
 * この口には認証が無く、`/api/graph` は解析対象のファイル構成と依存関係を
 * そのまま返す。既定で全インターフェースに開くと、同じネットワークにいる
 * 誰もがそれを読める。ローカルでの閲覧用であり、外部公開は扱わない。
 *
 * コンテナの中から外へ見せる必要が出た場合（UT-20）は、そこで明示的に開く。
 */
const server = serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`depenomap: http://localhost:${info.port}`)
  console.log(`  正本 JSON: ${config.graphPath}`)
})

/*
 * 待ち受けに失敗したときも、起動パラメータの不備と同じ扱いにする。
 * 既定のポートは dev と同じ番号であり、`pnpm dev` を残したまま起動すると
 * 必ず塞がっている。生のスタックトレースではなく、次にやることを出す。
 */
server.on('error', (cause: NodeJS.ErrnoException) => {
  if (cause.code === 'EADDRINUSE') {
    console.error(`ポート ${config.port} は既に使われている。`)
    console.error(`別のポートを指定する: --port <ポート> または ${PORT_ENV}`)
  } else {
    console.error(`サーバーを起動できなかった: ${cause.message}`)
  }
  process.exit(1)
})
