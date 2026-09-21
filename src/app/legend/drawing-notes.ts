/**
 * 描き方についての断り（UT-26 / QR-1）。
 *
 * 図には「そのまま描いていないもの」と「描くものが無いこと」がある。どちらも
 * 画面が黙っていると、読み手には**事実としてそう見える**。
 *
 * - インターフェース経由の呼び出しは、**インターフェース宛に描く**（UT-07 の
 *   決定）。型検査器が返した答えがインターフェース宛である以上それを正とし、
 *   実装へは `implements` の線で別にたどる。**行き先が実装に見えない**。
 *   図がそう描いていることは `GraphCanvas.test.ts` の「経由の呼び出しは、
 *   型検査器の答え（インターフェース宛）に向かう」が固定している
 * - ノードが 1 件も出ないとき、いまは何も出ない。絞り込んだ結果なのか、その
 *   粒度に無いのか、正本 JSON が空なのかが分からない
 *
 * **理由を言うだけで、良し悪しは言わない**（N-1）。
 */

import type { Granularity } from '@/core/ir/view-model'

import type { ViaReading } from '@/app/graph-canvas/via-reading'

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
  /** いまどちらの行き先で読んでいるか（UT-30） */
  reading: ViaReading
  /** グラフ全体で、インターフェース経由として解決したエッジの本数 */
  totalVia: number
  /** いま図に描いている、そのうちの本数（正本のエッジで数える） */
  drawnVia: number
}): string | undefined {
  if (input.totalVia === 0) return undefined

  if (input.granularity !== 'method')
    return 'インターフェース経由かどうかは、メソッド粒度で見えます'

  // 実装宛で読んでいるあいだは、読み替えの断り（`readingNoteOf`）がその話をする
  if (input.reading === 'implementation') return undefined

  // 絞り込んだ結果 1 本も出ていないなら、描き方の話をする場面ではない
  if (input.drawnVia === 0) return undefined

  return `インターフェース経由の ${input.drawnVia} 本は、インターフェース宛に描いています（実装へは implements の線でたどれます）`
}

/**
 * 実装宛で読んでいることの断り（UT-30）。
 *
 * **追従していないものを言う。** 読み方を変えても、被依存数・依存数・列（深度）・
 * 概要・循環の印は正本の集計（インターフェース宛）のままである。図の線だけが
 * 変わる。黙って食い違わせると、線と数値のどちらが本当か読み手に分からない。
 */
export function readingNoteOf(input: { retargeted: number }): string | undefined {
  if (input.retargeted === 0) return undefined

  return `${input.retargeted} 本を実装宛に読み替えて描いています（数値・列・循環の印は interface 宛のまま）`
}

/**
 * インターフェースを畳んでいることの断り（UT-29）。畳んでいなければ `undefined`。
 *
 * **隠していることは、常に画面から読めるようにする。** 読めなければ、図は
 * 「その依存が無い」と嘘をつく。
 *
 * 呼び出しは実装宛に描かれているので畳んでも残る。消えるのは `implements` の線
 * （誰が実装か）なので、そのことを添える。
 */
export function foldNoteOf(input: { foldedCount: number }): string | undefined {
  if (input.foldedCount === 0) return undefined

  return `インターフェースの ${input.foldedCount} 件を畳んでいます（implements の線も出ません）`
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
