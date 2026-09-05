import type { Cycle, DependencyGraph, GraphEdge, GraphNode, Unresolved } from '../graph/schema'
import type { Granularity } from './view-model'

/**
 * ノード ID からの引き当てインデックス。
 *
 * 誰が計算しても同じ答えになるものを、表示側に代わってここで用意する。
 * 「サイドバーの並び替えに被依存数が要る」といった要求が抽出側へ逆流するのを
 * 止めるのが IR の役割である（スキーマ §1）。
 */

/**
 * 被依存数（fanIn）を数える。
 *
 * **ノード数で数える**（UT-02 決定事項）。同じ 2 ノード間に何本エッジが
 * あっても 1 と数える。US-10（被依存数の降順）と US-14（影響範囲の逆引き）が
 * 知りたいのは「いくつの箇所から使われているか」であって呼び出し回数ではない。
 * 2 回呼ぶだけで影響範囲は倍にならない。
 *
 * 粒度ごとに独立して数える。
 */
export function buildFanIn(edges: readonly GraphEdge[]): ReadonlyMap<string, number> {
  const dependents = new Map<string, Set<string>>()
  for (const edge of edges) {
    const bucket = dependents.get(edge.to)
    if (bucket) bucket.add(edge.from)
    else dependents.set(edge.to, new Set([edge.from]))
  }
  return new Map([...dependents].map(([id, from]) => [id, from.size]))
}

/**
 * 循環の「型のみ」の状態。
 *
 * `cycles[].typeOnly` は import の `importKind` に由来する概念で、file 粒度の
 * 循環にしか現れない。メソッド呼び出しの循環にはフィールドごと欠ける。
 *
 * 欠落を `false` に潰すと「型のみではない」という**していない判定**をすることに
 * なるため、3 状態として区別する（N-1）。
 */
export type TypeOnlyState = 'type-only' | 'not-type-only' | 'unknown'

export function typeOnlyStateOf(cycle: Cycle): TypeOnlyState {
  if (cycle.typeOnly === undefined) return 'unknown'
  return cycle.typeOnly ? 'type-only' : 'not-type-only'
}

/**
 * ノードが含まれる循環を引く。
 *
 * 1 つのノードが複数の循環に属しうるため、配列で返す。循環の検出は行わない。
 * `cycles` は JSON が権威である（スキーマ §4）。
 */
export function buildCyclesByNode(cycles: readonly Cycle[]): ReadonlyMap<string, readonly Cycle[]> {
  const byNode = new Map<string, Cycle[]>()
  for (const cycle of cycles) {
    for (const nodeId of cycle.nodes) {
      const bucket = byNode.get(nodeId)
      if (bucket) bucket.push(cycle)
      else byNode.set(nodeId, [cycle])
    }
  }
  return byNode
}

/**
 * 未解決依存の引き当て。
 *
 * 「追えなくなった箇所」と「推測された候補」は別の関係であり、混ぜない。
 * 前者は事実（そこで追跡が止まった）、後者は推測である。確定情報と推測を
 * 混ぜるとグラフ全体の信頼性が読み手に伝わらなくなる（スキーマ §3）。
 */
export interface UnresolvedIndex {
  /** このノードで追跡が止まった、という関係 */
  byOrigin: ReadonlyMap<string, readonly Unresolved[]>
  /** このノードが候補として推測されている、という関係 */
  byCandidate: ReadonlyMap<string, readonly Unresolved[]>
}

export function buildUnresolvedIndex(items: readonly Unresolved[]): UnresolvedIndex {
  const byOrigin = new Map<string, Unresolved[]>()
  const byCandidate = new Map<string, Unresolved[]>()

  const push = (map: Map<string, Unresolved[]>, key: string, item: Unresolved): void => {
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }

  for (const item of items) {
    push(byOrigin, item.from, item)
    for (const candidate of item.candidates) push(byCandidate, candidate, item)
  }
  return { byOrigin, byCandidate }
}

/** 粒度ごとの被依存数をまとめて組む */
export function buildFanInByGranularity(
  graph: DependencyGraph,
): Readonly<Record<Granularity, ReadonlyMap<string, number>>> {
  return {
    file: buildFanIn(graph.edges.filter((e) => e.granularity === 'file')),
    method: buildFanIn(graph.edges.filter((e) => e.granularity === 'method')),
  }
}

/** 被依存数の降順で並べる（US-10）。同数のときは正本 JSON の並びを保つ */
export function sortByFanInDesc(
  nodes: readonly GraphNode[],
  fanIn: ReadonlyMap<string, number>,
): readonly GraphNode[] {
  return [...nodes]
    .map((node, index) => ({ node, index, count: fanIn.get(node.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((entry) => entry.node)
}
