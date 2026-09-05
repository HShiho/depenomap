import type {
  Cycle,
  DependencyGraph,
  GraphEdge,
  GraphNode,
  Layer,
  Unresolved,
} from '../graph/schema'
import { buildCyclesByNode, buildFanInByGranularity, buildUnresolvedIndex } from './indices'
import { buildSearchKeys, matches, type SearchKey } from './search'

/**
 * 表示用中間表現（ViewModel）。
 *
 * 正本 JSON を表示都合の形へ**一方向に**変換する（C-2）。IR から正本へ
 * 書き戻す経路を持たない。IR は揮発性であり、永続化しない（C-3）。
 *
 * IR を挟む目的は、表示都合の要求が抽出側へ逆流するのを止めることにある。
 * 「サイドバーの並び替えに被依存数が要る」→「抽出側に足すか」という圧力を、
 * 構造として断る。誰が計算しても同じ答えになるものは、すべてここが引き受ける。
 *
 * 正本 JSON の妥当性・参照整合性・ID の一意性・参照先のノード種別は
 * UT-01 が保証済みであり、ここで再検査しない。
 */

/** 表示粒度。ファイル単位とメソッド単位（US-03） */
export type Granularity = 'file' | 'method'

/**
 * 層が未設定のノードをまとめる既定の分類（ADR-002）。
 *
 * どの `match` にも当たらないノードは生じうる。層が定義されていないこと
 * 自体を欠陥として扱わない（N-1）ため、専用の分類を 1 つ用意して受け止める。
 */
export const NO_LAYER = Symbol('層なし')
export type LayerKey = string | typeof NO_LAYER

/** 層の引き当て結果。`NO_LAYER` のときは定義が無い */
export interface LayerBinding {
  key: LayerKey
  /** 正本 JSON の層定義。`NO_LAYER` のときは undefined */
  layer: Layer | undefined
}

export interface ViewModel {
  /** 粒度ごとのノード集合。配列の順序は正本 JSON の並びを保つ */
  nodes: Readonly<Record<Granularity, readonly GraphNode[]>>
  /** 粒度ごとのエッジ集合 */
  edges: Readonly<Record<Granularity, readonly GraphEdge[]>>

  /** ノード ID からノードを引く */
  nodeById: ReadonlyMap<string, GraphNode>
  /** エッジ ID からエッジを引く */
  edgeById: ReadonlyMap<string, GraphEdge>

  /** ノード ID から層を引く。層未設定のノードも必ず引ける（`NO_LAYER` が返る） */
  layerOf: (nodeId: string) => LayerBinding
  /** 層のキーから、その層に属するノードを引く */
  nodesByLayer: ReadonlyMap<LayerKey, readonly GraphNode[]>
  /** 層のキーの一覧。正本 JSON の並び + 層なしが 1 件あれば末尾 */
  layerKeys: readonly LayerKey[]

  /**
   * メソッドの所属。属性（`parent`）と引き当ての両方を持つ（UT-02 決定事項）。
   * 描画はノードの属性を見て、サイドバーはファイルから引く。
   */
  methodsOfFile: ReadonlyMap<string, readonly GraphNode[]>
  /** メソッドノード ID から所属ファイルノードを引く */
  fileOfMethod: (methodId: string) => GraphNode | undefined

  /**
   * 被依存数。粒度ごとに独立して数える。同じ 2 ノード間に何本エッジが
   * あっても 1（UT-02 決定事項）
   */
  fanInOf: (nodeId: string, granularity: Granularity) => number
  /** ノードが含まれる循環。複数の循環に属しうるため配列 */
  cyclesOf: (nodeId: string) => readonly Cycle[]
  /** このノードで追跡が止まった、という未解決依存 */
  unresolvedFrom: (nodeId: string) => readonly Unresolved[]
  /** このノードが候補として推測されている、という未解決依存 */
  unresolvedCandidatesFor: (nodeId: string) => readonly Unresolved[]

  /** ノードの検索キー。小文字化済みで事前に持つ（ADR-003） */
  searchKeyOf: (nodeId: string) => SearchKey | undefined
  /**
   * 検索語に一致するノードを引く。部分一致・大文字小文字を区別しない。
   * 空の検索語は 0 件を返す。「空なら全件」とするかは UT-11 の判断
   */
  findByQuery: (query: string, granularity: Granularity) => readonly GraphNode[]
}

function groupBy<K, T>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }
  return map
}

/**
 * 正本 JSON から ViewModel を組み立てる。
 *
 * 変換は一方向であり、戻す口を持たない（C-2 / C-3）。
 */
export function buildViewModel(graph: DependencyGraph): ViewModel {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]))

  const nodes = {
    file: graph.nodes.filter((n) => n.kind === 'file'),
    method: graph.nodes.filter((n) => n.kind === 'method'),
  } as const
  const edges = {
    file: graph.edges.filter((e) => e.granularity === 'file'),
    method: graph.edges.filter((e) => e.granularity === 'method'),
  } as const

  // 層は JSON が権威であり、ビューアは推測しない（ADR-002）。
  // glob の再照合はしない。抽出時に適用済みの `nodes[].layer` を引くだけ
  const layerById = new Map(graph.layers.map((l) => [l.id, l]))
  const bindingOf = (node: GraphNode): LayerBinding => {
    const layer = node.layer === undefined ? undefined : layerById.get(node.layer)
    return layer ? { key: layer.id, layer } : { key: NO_LAYER, layer: undefined }
  }

  const nodesByLayer = groupBy(graph.nodes, (n) => bindingOf(n).key)
  // 並び順はビューアが決める（`layers[]` は order を持たない設計 / ADR-002）。
  // ここでは正本 JSON の並びを保ち、層なしだけを末尾に置く
  const layerKeys: LayerKey[] = graph.layers.filter((l) => nodesByLayer.has(l.id)).map((l) => l.id)
  if (nodesByLayer.has(NO_LAYER)) layerKeys.push(NO_LAYER)

  const methodsOfFile = groupBy(nodes.method, (n) => (n.kind === 'method' ? n.parent : ''))

  const fanIn = buildFanInByGranularity(graph)
  const cyclesByNode = buildCyclesByNode(graph.cycles)
  const unresolved = buildUnresolvedIndex(graph.unresolved)
  const searchKeys = buildSearchKeys(graph.nodes, (id) => {
    const file = nodeById.get(id)
    return file?.kind === 'file' ? file.path : undefined
  })

  return {
    nodes,
    edges,
    nodeById,
    edgeById,
    layerOf: (nodeId) => {
      const node = nodeById.get(nodeId)
      return node ? bindingOf(node) : { key: NO_LAYER, layer: undefined }
    },
    nodesByLayer,
    layerKeys,
    methodsOfFile,
    fileOfMethod: (methodId) => {
      const node = nodeById.get(methodId)
      if (node?.kind !== 'method') return undefined
      return nodeById.get(node.parent)
    },
    fanInOf: (nodeId, granularity) => fanIn[granularity].get(nodeId) ?? 0,
    cyclesOf: (nodeId) => cyclesByNode.get(nodeId) ?? [],
    unresolvedFrom: (nodeId) => unresolved.byOrigin.get(nodeId) ?? [],
    unresolvedCandidatesFor: (nodeId) => unresolved.byCandidate.get(nodeId) ?? [],
    searchKeyOf: (nodeId) => searchKeys.get(nodeId),
    findByQuery: (query, granularity) =>
      nodes[granularity].filter((node) => {
        const key = searchKeys.get(node.id)
        return key ? matches(key, query) : false
      }),
  }
}
