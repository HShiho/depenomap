/**
 * 選択による絞り込み（UT-14 / US-12）。
 *
 * 選んだノードと、その**直接の依存先・依存元だけ**を残す。関係しないノードは
 * 薄くするのではなく消す — 薄いままだと、線が交差する図では結局どれが関係して
 * いるのか読めない。
 *
 * **両方向を同時に残す**。変更の影響範囲を見たい（US-14 / 依存元）ときと、
 * 到達範囲を見たい（US-15 / 依存先）ときで操作を分けない。どちらも「このノード
 * の周り」を見る行為で、分けると利用者が先に向きを決めることになる。
 *
 * **たどっても範囲は広がらない**。隣のノードを選べば、そのノードを中心に絞り
 * 直す。広げていく形にすると、いま何段目まで見ているのかを持つことになり、
 * 深度を指定して表示範囲を切り替える操作（N-2）に近づく。
 *
 * 到達範囲や影響範囲の**適否は判定しない**（N-1 / N-6）。ここが返すのは
 * 「残すノードの集合」だけで、良し悪しの印は持たない。
 */

import type { GraphEdge, GraphNode } from '@/core/graph/schema'

/**
 * 絞り込んだあとに残るノードの ID。
 *
 * 選択が無ければ `undefined` を返す。**空集合と区別する** — 空集合は「絞った
 * 結果 0 件」だが、選択が無いのは「絞っていない」であって、描く側の扱いが違う。
 */
export function narrowedNodeIds(input: {
  nodes: readonly GraphNode[]
  edges: readonly GraphEdge[]
  selectedNodeId: string | undefined
}): ReadonlySet<string> | undefined {
  const { selectedNodeId } = input
  if (selectedNodeId === undefined) return undefined

  // その粒度に無いノードを選んでいるときは絞らない。器（UT-05）は粒度を合わせるが、
  // 渡された値だけで閉じるようにする
  if (!input.nodes.some((node) => node.id === selectedNodeId)) return undefined

  const kept = new Set([selectedNodeId])
  for (const edge of input.edges) {
    if (edge.from === selectedNodeId) kept.add(edge.to)
    if (edge.to === selectedNodeId) kept.add(edge.from)
  }
  return kept
}
