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
 * 効くのは**絞り込み中だけ**（UT-14）。そのとき残るのは選択と直接の相手だけで、
 * 各ノードは選択との間にちょうど 1 本のエッジを持つ。絞っていない図では「ある
 * 対象」が定まらず、呼び出し順という概念そのものが無い。
 */

import type { GraphEdge, GraphNode } from '@/core/graph/schema'

/** 並べ替えの桁合わせ。文字列として比べるため、数値は幅を揃える */
const WIDTH = 6

/**
 * 選択との間のエッジから、列内の並び順のキーを作る。
 *
 * 3 つの段に分ける。
 *
 *   1. 選択そのもの — 自分の列の先頭に置く
 *   2. `sourceOrder` を持つエッジの相手 — その昇順（US-05）
 *   3. 持たないエッジの相手（`import` / `implements`）— 正本 JSON の並びのまま、
 *      持つものの後ろ（UT-02 の決定。ここで順序を捏造しない）
 */
export function callOrderKeys(input: {
  edges: readonly GraphEdge[]
  selectedNodeId: string
}): (node: GraphNode) => string | undefined {
  const keys = new Map<string, string>()
  keys.set(input.selectedNodeId, '0')

  input.edges.forEach((edge, index) => {
    const other =
      edge.from === input.selectedNodeId
        ? edge.to
        : edge.to === input.selectedNodeId
          ? edge.from
          : undefined
    if (other === undefined || other === input.selectedNodeId || keys.has(other)) return

    const order = orderOf(edge)
    keys.set(
      other,
      order === undefined
        ? `2:${String(index).padStart(WIDTH, '0')}`
        : `1:${String(order).padStart(WIDTH, '0')}`,
    )
  })

  return (node) => keys.get(node.id)
}

/** `sourceOrder` は call / construct にしか無い（スキーマ §3） */
function orderOf(edge: GraphEdge): number | undefined {
  return edge.kind === 'call' || edge.kind === 'construct' ? edge.sourceOrder : undefined
}
