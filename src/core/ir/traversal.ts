import type { GraphEdge, GraphNode } from '../graph/schema'
import type { Granularity } from './view-model'

/**
 * 依存のたどり。
 *
 * 依存先・依存元を引く処理を IR に置くのは、置かないと UT-06 / UT-09 / UT-14 が
 * それぞれエッジ配列を自前で絞り込むことになるためである。同じ絞り込みが 3 箇所に
 * 散ると、とくに `via-interface` の扱い（論理依存をたどるか実依存をたどるか）が
 * UT ごとにばらつく。誰が計算しても同じ答えになるものは IR が引き受ける。
 */

/**
 * `via-interface` のエッジをどうたどるか（UT-02 決定事項）。
 *
 * `to` は型検査器が返した答え（インターフェース）、`implementations` は自前で
 * 解決した実装である。どちらか一方に潰すと後から復元できない（スキーマ §3）ため、
 * 両方を保持したうえで、たどり方を呼び出し側が選ぶ。
 *
 * - `logical` — `to` をたどる。インターフェース宛の依存として読む
 * - `actual` — `implementations` をたどる。実装宛の依存として読む。
 *   `implementations` が無い、または空なら `to` に落ちる
 */
export type InterfaceTraversal = 'logical' | 'actual'

export interface TraversalOptions {
  /** 既定は `logical`（型検査器の答えをそのまま読む） */
  via?: InterfaceTraversal
}

/** たどった先の 1 件 */
export interface Dependency {
  /** たどり着いたノード */
  node: GraphNode
  /** 経路となったエッジ */
  edge: GraphEdge
  /**
   * `via-interface` を `actual` でたどった結果かどうか。
   * true のとき `node` は `edge.to` ではなく `implementations` の要素を指す
   */
  viaImplementation: boolean
}

function implementationsOf(edge: GraphEdge): readonly string[] {
  if (edge.kind !== 'call' && edge.kind !== 'construct') return []
  if (edge.resolution !== 'via-interface') return []
  return edge.implementations ?? []
}

/**
 * エッジを「ソース上の出現順」で並べる（C-7 / US-05）。
 *
 * `sourceOrder` は call / construct にしか無い（import / implements は持たない）。
 * 持たないエッジは正本 JSON の並びを保ったまま、持つエッジの後ろに置く。
 * ここで順序を捏造しない。
 *
 * **これは出現順であって実行順ではない。** 条件分岐やループがあれば実行順と
 * 一致しない。制御構文によって実行時にしか定まらない順序は加味しない（C-7）。
 */
export function sortBySourceOrder<T extends { edge: GraphEdge }>(
  items: readonly T[],
): readonly T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = orderOf(a.item.edge)
      const bo = orderOf(b.item.edge)
      if (ao === undefined && bo === undefined) return a.index - b.index
      if (ao === undefined) return 1
      if (bo === undefined) return -1
      return ao - bo || a.index - b.index
    })
    .map((entry) => entry.item)
}

function orderOf(edge: GraphEdge): number | undefined {
  return edge.kind === 'call' || edge.kind === 'construct' ? edge.sourceOrder : undefined
}

/** 依存のたどりを組む。粒度ごとに from / to の索引を持つ */
export function buildTraversal(
  edgesByGranularity: Readonly<Record<Granularity, readonly GraphEdge[]>>,
  nodeById: ReadonlyMap<string, GraphNode>,
) {
  const index = (pick: (e: GraphEdge) => string) => {
    const build = (edges: readonly GraphEdge[]): Map<string, GraphEdge[]> => {
      const map = new Map<string, GraphEdge[]>()
      for (const edge of edges) {
        const key = pick(edge)
        const bucket = map.get(key)
        if (bucket) bucket.push(edge)
        else map.set(key, [edge])
      }
      return map
    }
    return { file: build(edgesByGranularity.file), method: build(edgesByGranularity.method) }
  }

  const outgoing = index((e) => e.from)
  // 依存元の索引は 2 通り持つ。logical は to（インターフェース）宛、
  // actual は implementations（実装）宛で引く。片方だけだと、実依存で
  // たどれる経路が逆から引けなくなり、US-14（影響範囲の逆引き）が取りこぼす
  const incomingLogical = index((e) => e.to)
  const incomingActual = ((): Readonly<Record<Granularity, Map<string, GraphEdge[]>>> => {
    const build = (edges: readonly GraphEdge[]): Map<string, GraphEdge[]> => {
      const map = new Map<string, GraphEdge[]>()
      const push = (key: string, edge: GraphEdge): void => {
        const bucket = map.get(key)
        if (bucket) bucket.push(edge)
        else map.set(key, [edge])
      }
      for (const edge of edges) {
        const implementations = implementationsOf(edge)
        if (implementations.length > 0) for (const id of implementations) push(id, edge)
        else push(edge.to, edge)
      }
      return map
    }
    return { file: build(edgesByGranularity.file), method: build(edgesByGranularity.method) }
  })()

  const resolve = (edge: GraphEdge, via: InterfaceTraversal): Dependency[] => {
    const implementations = via === 'actual' ? implementationsOf(edge) : []
    if (implementations.length > 0) {
      return implementations
        .map((id) => nodeById.get(id))
        .filter((node): node is GraphNode => node !== undefined)
        .map((node) => ({ node, edge, viaImplementation: true }))
    }
    const node = nodeById.get(edge.to)
    return node ? [{ node, edge, viaImplementation: false }] : []
  }

  return {
    /** 依存先。ソース上の出現順に並べる（US-05） */
    dependenciesOf: (
      nodeId: string,
      granularity: Granularity,
      options: TraversalOptions = {},
    ): readonly Dependency[] => {
      const edges = outgoing[granularity].get(nodeId) ?? []
      return sortBySourceOrder(edges.flatMap((edge) => resolve(edge, options.via ?? 'logical')))
    },

    /**
     * 依存元。「このノードを使っているのは誰か」を引く（US-14）。
     *
     * via は依存先と対称に効く。actual で引くと、via-interface の呼び出し元が
     * 実装ノードの依存元として現れる。並べ替えの材料が無いため、
     * 正本 JSON の並びを保つ
     */
    dependentsOf: (
      nodeId: string,
      granularity: Granularity,
      options: TraversalOptions = {},
    ): readonly Dependency[] => {
      const via = options.via ?? 'logical'
      const source = via === 'actual' ? incomingActual : incomingLogical
      const edges = source[granularity].get(nodeId) ?? []
      return edges
        .map((edge) => {
          const node = nodeById.get(edge.from)
          if (!node) return undefined
          const viaImplementation = via === 'actual' && implementationsOf(edge).includes(nodeId)
          return { node, edge, viaImplementation }
        })
        .filter((d): d is Dependency => d !== undefined)
    },
  }
}
