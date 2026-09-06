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
 *   `implementations` が無い、空、あるいは 1 件も引けなければ `to` に落ちる
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

/**
 * エッジの `implementations` を引く。
 *
 * 重複は畳む。UT-01 の整合性検査は参照先の存在と種別しか見ておらず、
 * 配列内に同じ ID が 2 度現れることを防いでいない。畳まないと同じノードを
 * 2 回たどり、依存先の件数も依存元の件数も水増しされる
 */
function implementationsOf(edge: GraphEdge): readonly string[] {
  if (edge.kind !== 'call' && edge.kind !== 'construct') return []
  if (edge.resolution !== 'via-interface') return []
  return edge.implementations ? [...new Set(edge.implementations)] : []
}

/**
 * `actual` でたどったときに、このエッジが指すノード ID を返す。
 *
 * 前向き（依存先）と逆向き（依存元）の索引が同じ規則を使うための唯一の定義。
 * 別々に書くと、実装が引けないエッジの扱いが片側でだけずれ、
 * 「via は依存先と対称に効く」という契約が静かに破れる。
 *
 * 実装が 1 件も引けなければ `to` に落ちる。ここで空を返すと、logical では
 * 見えている依存が actual でだけ黙って消え、たどり方の切り替えが
 * 依存の有無そのものを変えてしまう。
 */
function actualTargetsOf(edge: GraphEdge, has: (id: string) => boolean): readonly string[] {
  const resolved = implementationsOf(edge).filter(has)
  return resolved.length > 0 ? resolved : [edge.to]
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
        for (const id of actualTargetsOf(edge, (x) => nodeById.has(x))) push(id, edge)
      }
      return map
    }
    return { file: build(edgesByGranularity.file), method: build(edgesByGranularity.method) }
  })()

  const resolve = (edge: GraphEdge, via: InterfaceTraversal): Dependency[] => {
    const targets = via === 'actual' ? actualTargetsOf(edge, (id) => nodeById.has(id)) : [edge.to]
    return targets
      .map((id) => nodeById.get(id))
      .filter((node): node is GraphNode => node !== undefined)
      .map((node) => ({ node, edge, viaImplementation: node.id !== edge.to }))
  }

  /** 依存先。ソース上の出現順に並べる（US-05） */
  const dependenciesOf = (
    nodeId: string,
    granularity: Granularity,
    options: TraversalOptions = {},
  ): readonly Dependency[] => {
    const edges = outgoing[granularity].get(nodeId) ?? []
    return sortBySourceOrder(edges.flatMap((edge) => resolve(edge, options.via ?? 'logical')))
  }

  /**
   * 依存元。「このノードを使っているのは誰か」を引く（US-14）。
   *
   * via は依存先と対称に効く。actual で引くと、via-interface の呼び出し元が
   * 実装ノードの依存元として現れる。並べ替えの材料が無いため、
   * 正本 JSON の並びを保つ。
   *
   * **対称であるとは、同じエッジが片側にしか現れないことでもある。**
   * actual では via-interface のエッジが実装ノードの側へ移るため、
   * インターフェースメソッドの依存元からは消える（残るのは implements など、
   * `implementations` を持たないエッジだけ）。どちらの読み方をしているかは
   * 呼び出し側が選んだ `via` で決まる
   */
  const dependentsOf = (
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
        const viaImplementation = via === 'actual' && nodeId !== edge.to
        return { node, edge, viaImplementation }
      })
      .filter((d): d is Dependency => d !== undefined)
  }

  /**
   * 依存元をノード単位に畳む（US-14 / US-10）。
   *
   * `dependentsOf` はエッジ 1 本につき 1 件返すため、同じ 2 ノード間に複数
   * エッジがあると同じノードが繰り返し現れる。畳み方（重複をどう潰すか）は
   * 誰が書いても同じ答えになるものであり、消費側が各々書くと同じ絞り込みが
   * 散る。既定の `logical` では件数が `fanInOf` と一致する。
   *
   * 並びは最初に現れたエッジの順、すなわち正本 JSON の並びを保つ。
   */
  const dependentNodesOf = (
    nodeId: string,
    granularity: Granularity,
    options: TraversalOptions = {},
  ): readonly GraphNode[] => {
    const seen = new Set<string>()
    const nodes: GraphNode[] = []
    for (const dependency of dependentsOf(nodeId, granularity, options)) {
      if (seen.has(dependency.node.id)) continue
      seen.add(dependency.node.id)
      nodes.push(dependency.node)
    }
    return nodes
  }

  return { dependenciesOf, dependentsOf, dependentNodesOf }
}
