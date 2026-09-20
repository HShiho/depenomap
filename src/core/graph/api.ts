/**
 * グラフ取得の口（UT-03 が公開する契約）。サーバーが登録する場所と、
 * 画面が取りに行く場所を 1 つの定義から使う。
 *
 * `src/core/` に置くのは、**サーバーと画面の両方が同じものを見る必要がある**ため。
 * 画面が `src/server/` を、サーバーが `src/app/` を import する形にすると
 * 境界の向きが崩れる。ここに置けば、どちらも自分より下の層を見るだけで済む。
 * 中身は定数と型と `fetch` の薄い包みだけで、ブラウザでも動く（ADR-005）。
 */

import type { LoadResult } from './loader'

/** 画面がグラフを取りに来る場所 */
export const GRAPH_ENDPOINT = '/api/graph'

/**
 * ノードの相対パスから、ホスト側で開ける位置を尋ねる場所（UT-20）。
 *
 * 相対パスは `?path=` で渡す。**`encodeURIComponent` を通すこと** — クエリの
 * `+` は復号すると空白になるため、`a+b.ts` のような名前がそのままだと別の
 * ファイルを指す。
 *
 * **この口はサーバーにしか持てない** — 画面は自分が動いている場所しか知らず、
 * 実ファイルの在り処を知らない（ADR-004）。
 */
export const LOCATE_ENDPOINT = '/api/locate'

/** 解決できなかった理由。呼び出し側（UT-18）が何を案内するかを決められるようにする */
export type LocateFailure =
  /** リポジトリの在り処が渡されていない（起動パラメータ） */
  | 'no-repo'
  /** 相対パスとして受け取れない形（絶対パス、リポジトリの外へ出る、など） */
  | 'bad-path'

/**
 * 位置を尋ねた結果。
 *
 * **解決できないことを失敗として扱わない**（N-1）。実体が無くても位置は返す
 * （`exists: false`）。この口は 200 で返り、結果は本文に載る。
 */
export type LocateResult =
  | {
      resolved: true
      /** ホストから見た絶対パス。エディタへ渡すのはこちら */
      hostPath: string
      /** そこに実体があったか。**無いことを欠陥として扱わない**（N-1） */
      exists: boolean
    }
  | { resolved: false; reason: LocateFailure }

/**
 * 取得の結果。
 *
 * **サーバーに届いたかどうか**（`reached`）と、**正本 JSON を読めたかどうか**
 * （`LoadResult` の `ok`）を分けて持つ。前者は UT-03 の問題（起動していない、
 * 経路が違う）で、後者は正本 JSON の問題（UT-01 の判定）である。混ぜると、
 * 表示する側（UT-05）が利用者に何を直させればよいか言えなくなる。
 */
export type FetchGraphOutcome =
  { reached: true; result: LoadResult } | { reached: false; message: string }

/**
 * グラフを取りに行く。
 *
 * `fetchImpl` を差し替えられるようにしてあるのはテストのため。既定は
 * その環境の `fetch` を使う。
 */
export async function fetchGraph(fetchImpl: typeof fetch = fetch): Promise<FetchGraphOutcome> {
  let response: Response
  try {
    response = await fetchImpl(GRAPH_ENDPOINT)
  } catch (cause) {
    return { reached: false, message: (cause as Error).message }
  }

  /*
   * 読み込みの失敗は 200 で本文に載って返る（UT-03 決定事項）。
   * したがってここに来る非 200 は「口そのものに届いていない」を意味する。
   */
  if (!response.ok) {
    return { reached: false, message: `${GRAPH_ENDPOINT} が ${response.status} を返した` }
  }

  try {
    // 本文の形は検査しない。この口の応答はこのリポジトリのサーバーが組み立てており、
    // 正本 JSON の妥当性は既にサーバー側で UT-01 が判定している
    return { reached: true, result: (await response.json()) as LoadResult }
  } catch (cause) {
    return { reached: false, message: `応答を JSON として読めない: ${(cause as Error).message}` }
  }
}
