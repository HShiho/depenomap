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

/** `/assets/index-abc.js` のようにファイルを名指ししているか。`/nodes/some-file` は該当しない */
function hasFileExtension(path: string): boolean {
  return /\.[^./]+$/.test(path)
}

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

  /*
   * 知らない `/api/*` は 404 で返す。画面のフォールバック（下）に巻き込むと、
   * 本番だけ 200 + index.html になり、dev（Vite が 404 を返す）と食い違う。
   *
   * 取得の口（`core/graph/api.ts`）は「非 200 = 口そのものに届いていない」を
   * 前提にしており、200 で HTML が返ると、叩き先の間違いが
   * 「応答を JSON として読めない」という別の理由に化ける。
   */
  app.all('/api/*', (c) => c.notFound())

  if (options.clientDir !== undefined) {
    /*
     * 静的配信は API を登録したあとに置く。`/api/graph` を先に引き当てるためである。
     *
     * `serveStatic` の `root` は作業ディレクトリからの相対でしか受け付けないため、
     * 絶対パスから畳み直す。
     */
    const root = relative(process.cwd(), options.clientDir) || '.'

    /*
     * 画面の入口（HTML）はビルドのたびに中身が変わり、参照するアセットの名前も
     * 変わる。古い入口を握られると、消えたアセットを要求し続ける形になるため
     * 毎回問い合わせさせる。名前にハッシュの付くアセット側は対象外でよい。
     */
    app.use('/*', async (c, next) => {
      if (!hasFileExtension(c.req.path)) c.header('Cache-Control', 'no-cache')
      await next()
    })

    app.use('/*', serveStatic({ root }))

    /*
     * どのファイルにも当たらない要求には `index.html` を返す。画面は単一ページであり、
     * 直接 URL を叩かれても画面が出る形にしておく。
     *
     * ただし**拡張子付きの要求は対象外**にする。それはファイルを求めており、
     * 無いのに index.html を返すと、再ビルドで名前の変わったアセットを古い
     * index.html が要求したときに HTML が 200 で返り、MIME の食い違いで
     * 画面が起動しない形になる。
     */
    app.get('*', async (c, next) => {
      if (hasFileExtension(c.req.path)) return c.notFound()
      return (await serveStatic({ root, path: 'index.html' })(c, next)) ?? c.notFound()
    })
  }

  return app
}
