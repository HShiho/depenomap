/**
 * 描き方についての断り（UT-26 / QR-1）。
 *
 * 図には「そのまま描いていないもの」と「描くものが無いこと」がある。どちらも
 * 画面が黙っていると、読み手には**事実としてそう見える**。
 *
 * - インターフェース経由の呼び出しは、**実装へ解決して 1 本で描く**（UT-07）。
 *   呼び出し元 → interface → 実装 の 2 本は図に無い
 * - ノードが 1 件も出ないとき、いまは何も出ない。絞り込んだ結果なのか、その
 *   粒度に無いのか、正本 JSON が空なのかが分からない
 *
 * **理由を言うだけで、良し悪しは言わない**（N-1）。
 */

import type { Granularity } from '@/core/ir/view-model'

/**
 * インターフェース経由の解決についての断り。言うことが無ければ `undefined`。
 *
 * @param viaCount メソッド粒度で解決したエッジの本数。**粒度によらず同じ数**を
 *   渡す（ファイル粒度では図に出ないだけで、解決そのものは起きている）
 */
export function viaNoteOf(input: {
  granularity: Granularity
  viaCount: number
}): string | undefined {
  // 1 本も無いグラフでは、断ること自体が無い
  if (input.viaCount === 0) return undefined

  return input.granularity === 'method'
    ? `インターフェース経由の ${input.viaCount} 本を、実装へ解決して描いています`
    : 'インターフェース経由の解決は、メソッド粒度で見えます'
}

/**
 * 図に出せるノードが無いことの断り。出ていれば `undefined`。
 *
 * **理由まで言う。** 「何も無い」とだけ出すと、絞り込みを解けば戻るのか、
 * 正本 JSON がそもそも空なのかが分からない。
 */
export function emptyNoteOf(input: {
  /** いま図に描いているノードの数 */
  shown: number
  /** 選択による絞り込みが立っているか（UT-14） */
  narrowed: boolean
  /** その粒度に、正本 JSON が持つノードの数 */
  inGranularity: number
}): string | undefined {
  if (input.shown > 0) return undefined

  if (input.narrowed) return '絞り込んだ結果、表示できるノードがありません'
  if (input.inGranularity === 0) return 'この粒度のノードが、正本 JSON にありません'
  return '表示できるノードがありません'
}
