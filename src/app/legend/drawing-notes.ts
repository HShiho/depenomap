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
 * **「描いています」と言う以上、描いている本数を言う。** 絞り込み中（UT-14）は
 * 図に出ている線だけが対象で、グラフ全体の本数とは違う。
 *
 * ファイル粒度では解決した線そのものが図に出ない。そこでは本数を言わず、
 * **どこで見えるか**を言う。グラフ全体に 1 本も無ければ、断ること自体が無い。
 */
export function viaNoteOf(input: {
  granularity: Granularity
  /** グラフ全体で、インターフェース経由として解決したエッジの本数 */
  totalVia: number
  /** いま図に描いている、そのうちの本数 */
  drawnVia: number
}): string | undefined {
  if (input.totalVia === 0) return undefined

  if (input.granularity !== 'method') return 'インターフェース経由の解決は、メソッド粒度で見えます'

  // 絞り込んだ結果 1 本も出ていないなら、描き方の話をする場面ではない
  if (input.drawnVia === 0) return undefined

  return `インターフェース経由の ${input.drawnVia} 本を、実装へ解決して描いています`
}

/**
 * 図に出せるノードが無いことの断り。出ていれば `undefined`。
 *
 * **理由まで言う。** 「何も無い」とだけ出すと、正本 JSON がそもそも空なのか、
 * この粒度に無いだけなのかが分からない。
 *
 * **絞り込み（UT-14）が原因になる経路は無い。** 絞り込みは選択したノードを必ず
 * 残す（`narrowing.ts`）ので、立っていれば 1 件以上出る。ここで「絞り込んだ
 * 結果です」と言えるようにしておくと、**起こらない理由を出す枝**が残る。
 */
export function emptyNoteOf(input: {
  /** いま図に描いているノードの数 */
  shown: number
  /** その粒度に、正本 JSON が持つノードの数 */
  inGranularity: number
}): string | undefined {
  if (input.shown > 0) return undefined

  return input.inGranularity === 0
    ? 'この粒度のノードが、正本 JSON にありません'
    : '表示できるノードがありません'
}
