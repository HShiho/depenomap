/**
 * 画面へグラフを渡す口。dev（Vite の middleware）と本番（Node）で同じものを使う。
 *
 * 載せ方だけが環境で変わり、口の振る舞いは 1 つに保つ。**組み立ては全部ここに
 * 置く**。`main.ts` に一部だけ置くと、そこは `app.request()` から叩けないため
 * 検証されないまま dev と本番の振る舞いが割れる。
 */

import { relative } from 'node:path'

import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import { GRAPH_ENDPOINT } from '../core/graph/api'
import { loadGraphFromFile } from '../core/graph/loader.node'
import type { ServerConfig } from './config'

export interface AppOptions {
  /**
   * ビルド済みの画面がある**絶対パス**。渡すと静的配信を載せる。
   * dev では画面を Vite が配信するため渡さない。
   */
  clientDir?: string
}

/**
 * グラフを返す口を持つアプリを組み立てる。
 *
 * **読み込みは要求のたびに行う**（UT-03 決定事項）。起動時に読み切って持つと、
 * 正本 JSON を差し替えたときに再起動が要る。ファイルは 1 つ・数百 KB 規模であり、
 * ローカル閲覧用（認証も同時利用者もない）なので、読み直しの代償より
 * 「差し替えたら次の再読み込みで反映される」ことのほうが利用者に効く。
 * キャッシュを持たないため、無効化の判断も要らない。
 */
export function createApp(config: ServerConfig, options: AppOptions = {}): Hono {
  const app = new Hono()

  app.get(GRAPH_ENDPOINT, async (c) => {
    const result = await loadGraphFromFile(config.graphPath)

    /*
     * 読み込みに失敗しても **200 で返す**（UT-03 決定事項）。
     *
     * UT-01 の `LoadResult` は「読めたグラフ＋警告」と「読めなかった理由」を
     * 1 つの型で表しており、後者も HTTP としては正常に取得できた**結果**である。
     * 4xx / 5xx に割り振ると、失敗の理由が本文とステータスに二重化し、
     * 画面（UT-05）が「通信の失敗」と「読み込みの失敗」を別経路で扱うことになる。
     * 経路を 1 本にして、判定は UT-01、表示は UT-05 という分担をそのまま通す。
     */
    // 差し替えた JSON が中間キャッシュで古いまま返らないようにする
    c.header('Cache-Control', 'no-store')
    return c.json(result)
  })

  if (options.clientDir !== undefined) {
    /*
     * 静的配信は API を登録したあとに置く。`/api/graph` を先に引き当てるためである。
     *
     * `serveStatic` の `root` は作業ディレクトリからの相対でしか受け付けないため、
     * 絶対パスから畳み直す。
     */
    const root = relative(process.cwd(), options.clientDir) || '.'
    app.use('/*', serveStatic({ root }))

    /*
     * どのファイルにも当たらない要求には `index.html` を返す。画面は単一ページであり、
     * 直接 URL を叩かれても画面が出る形にしておく。
     */
    app.get('*', serveStatic({ root, path: 'index.html' }))
  }

  return app
}
