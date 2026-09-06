/**
 * dev で Hono を Vite の dev server に載せるためのプラグイン。
 *
 * dev と本番でプロセスを分けない（UT-03 決定事項）。Vite を主にして
 * Hono を middleware として差し込む形にすると、
 *
 * - 画面の HMR が素の Vite のまま効く
 * - `/api/*` が画面と同一オリジンになり、CORS もプロキシ設定も要らない
 * - 立ち上げるプロセスが 1 つで済む
 *
 * 別プロセスに分けると上記をすべて自前で埋めることになり、
 * 「dev では動くが本番で違う」経路が増える。**アプリ本体（`app.ts`）は
 * dev と本番で同一**で、載せ方だけが変わる。
 */

import { getRequestListener } from '@hono/node-server'
import type { Plugin } from 'vite'

import { GRAPH_PATH_ENV, PORT_ENV, resolveConfig, type ServerConfig } from './config.ts'

/** middleware に回す対象。ここに当たらない要求は Vite（画面）に渡す */
const API_PREFIX = '/api/'

function describeFailure(messages: string[]): string {
  return [
    '正本 JSON の指定に問題があるため dev server を起動できない。',
    ...messages.map((message) => `  - ${message}`),
    '',
    `例: ${GRAPH_PATH_ENV}=test-data/dependency-graph.complex.json pnpm dev`,
    `（待ち受けポートは ${PORT_ENV} で変えられる）`,
  ].join('\n')
}

/**
 * 起動パラメータを読み、`/api/*` を Hono に渡す。
 *
 * 指定が無ければ**起動しない**。本番（`main.ts`）と同じく、
 * 「起動できた＝どのグラフを見ているかが確定している」状態に揃える。
 * ここで既定のフィクスチャへ落とすと、dev だけが暗黙の正本を持つことになる。
 */
export function graphApiPlugin(): Plugin {
  return {
    name: 'depenomap:graph-api',

    /*
     * dev server にだけ載せる。ビルド成果物には関係しない。
     *
     * Vitest も Vite のサーバーを作る（モジュール変換のため）が、そちらは
     * 画面を配信しない。除いておかないと、正本 JSON を指定しない限り
     * テストが起動しなくなる。テストは `createApp` を直接叩く。
     */
    apply: (_config, env) => env.command === 'serve' && !process.env.VITEST,

    configureServer(server) {
      const resolved = resolveConfig([], process.env, process.cwd())
      if (!resolved.ok) throw new Error(describeFailure(resolved.messages))
      const config: ServerConfig = resolved.config

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(API_PREFIX)) return next()

        /*
         * 要求のたびに `app.ts` を読み込む。Vite がモジュールグラフを
         * キャッシュしており、編集したときだけ読み直される。静的 import に
         * すると、サーバー側のコードを触るたびに dev server の再起動が要る。
         */
        server
          .ssrLoadModule('/src/server/app.ts')
          .then((module) => {
            const { createApp } = module as typeof import('./app')
            getRequestListener(createApp(config).fetch)(req, res)
          })
          .catch((error: unknown) => next(error))
      })
    },
  }
}
