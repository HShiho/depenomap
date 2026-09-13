/**
 * 呼び出し順の並び（UT-09 / US-05）。
 *
 * ある対象の依存先が複数あるとき、**ソース上の出現順**で並べる。順序の材料は
 * `sourceOrder` の 1 フィールドだけで、他の推測は混ぜない（C-7）。
 *
 * **これは出現順であって実行順ではない。** 条件分岐やループがあれば実行順と
 * 一致しない。制御構文によって実行時にしか定まらない順序は、正本 JSON が持って
 * いないので、ここでも持たない。
 *
 * **並べ替えそのものは IR に委ねる**（`dependenciesOf` が `sortBySourceOrder` を
 * 通す）。ここでエッジ配列を自前で走査すると、同じ 2 ノード間に複数エッジが
 * あるとき・順序を持たないエッジが混ざるときの答えが IR とずれる。ここは
 * 「返ってきた並びを列の中の位置に写す」だけにしてある。
 *
 * **効くのは依存先だけ。** `sourceOrder` は呼ぶ側の本体の中での採番なので、
 * 依存元に当てると、選択とは無関係な採番空間の数値で並べることになる。US-05 が
 * 言っているのも依存先の順序である。依存元は既定の並びへ落とす。
 *
 * 効くのは**絞り込み中だけ**（UT-14）。絞っていない図では「ある対象」が定まらず、
 * 呼び出し順という概念そのものが無い。
 *
 * **効くかどうかの判定はここに閉じる。** 図の並びと画面の断り書きは別の場所で
 * 組み立てるので、前段の条件を各々が持つと、片方だけ条件が増えたときに
 * 「出現順と書いてあるのに並んでいない」が戻ってくる。呼ぶ側は絞り込み中か
 * どうかだけを渡し、残りはここが決める。
 */

import type { GraphNode } from '@/core/graph/schema'
import { sourceOrderOf } from '@/core/ir/traversal'
import type { Granularity, ViewModel } from '@/core/ir/view-model'

/** 並べ替えの桁合わせ。文字列として比べるため、数値は幅を揃える */
const WIDTH = 6

export interface CallOrder {
  /**
   * 呼び出し順が実際に効いているか。
   *
   * 順序を持つ依存先が 2 件以上あって初めて、並びが出現順を表す。材料が無い
   * ところで「出現順に並んでいる」と名乗らないための札で、画面の断り書きは
   * これを見て出す（C-7）。
   */
  applies: boolean
  /** 列の中の並び順のキー。順序が効かないノードは `undefined`（既定の並びへ落ちる） */
  keyOf: (node: GraphNode) => string | undefined
}

/** 順序が効かないときの答え。呼ぶ側は既定の並びをそのまま使う */
const NONE: CallOrder = { applies: false, keyOf: () => undefined }

/**
 * 選択の依存先を、ソース上の出現順で列の中に並べるキーを作る。
 *
 * 2 段に分ける。
 *
 *   1. 選択そのもの — 自分の列の先頭に置く
 *   2. **順序を持つ**依存先 — `dependenciesOf` が返した順
 *
 * 順序を持たないエッジ（`import` / `implements`）の相手には、キーを配らない。
 * 配ると、その位置の根拠が「正本 JSON のエッジ配列の並び」になってしまい、
 * 画面で断っている出現順とは別のものを出現順として見せることになる（C-7）。
 * 既定の並びへ落として、パス順のまま後ろに置く。
 *
 * 同じノードへ複数のエッジが向いているときは、**先に来たほうを採る**。
 * `dependenciesOf` は出現順で並べて返すので、これは最も早い出現順にあたる。
 */
export function callOrder(input: {
  viewModel: ViewModel | undefined
  granularity: Granularity
  selectedNodeId: string | undefined
  /** 選択の周辺だけに絞っているか（UT-14） */
  narrowed: boolean
}): CallOrder {
  if (!input.narrowed || input.viewModel === undefined || input.selectedNodeId === undefined) {
    return NONE
  }

  const ordered = input.viewModel
    .dependenciesOf(input.selectedNodeId, input.granularity)
    .filter((dependency) => sourceOrderOf(dependency.edge) !== undefined)

  /*
   * **数えるのはノードで、エッジではない。** 同じ相手を 2 箇所から呼ぶと
   * エッジは 2 本だが、列に並ぶ依存先は 1 件しかない。並びようのないものを
   * 「出現順に並んでいる」と説明しないため（C-7）、ここはノードで数える
   */
  const keys = new Map<string, string>()
  ordered.forEach((dependency, rank) => {
    const id = dependency.node.id
    if (keys.has(id)) return
    keys.set(id, `1:${String(rank).padStart(WIDTH, '0')}`)
  })
  if (keys.size < 2) return NONE

  keys.set(input.selectedNodeId, '0')

  return { applies: true, keyOf: (node) => keys.get(node.id) }
}
