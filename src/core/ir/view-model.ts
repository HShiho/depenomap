import type {
  Cycle,
  DependencyGraph,
  FileNode,
  GraphEdge,
  GraphNode,
  Layer,
  MethodNode,
  Unresolved,
} from '../graph/schema'
import {
  buildCyclesByNode,
  buildFanInByGranularity,
  buildUnresolvedIndex,
  sortByFanInDesc,
} from './indices'
import { buildSearchKeys, matches, type SearchKey } from './search'
import { buildTraversal, type Dependency, type TraversalOptions } from './traversal'

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
  nodes: { readonly file: readonly FileNode[]; readonly method: readonly MethodNode[] }
  /** 粒度ごとのエッジ集合 */
  edges: Readonly<Record<Granularity, readonly GraphEdge[]>>

  /** ノード ID からノードを引く */
  nodeById: ReadonlyMap<string, GraphNode>
  /** エッジ ID からエッジを引く */
  edgeById: ReadonlyMap<string, GraphEdge>

  /** ノード ID から層を引く。層未設定のノードも必ず引ける（`NO_LAYER` が返る） */
  layerOf: (nodeId: string) => LayerBinding
  /**
   * 層のキーから、その層に属するノードを引く。
   * `layerKeys` の全キーが必ずバケットを持つ（ノードが 0 件なら空配列）。
   *
   * **粒度で分けない。** 完了条件は粒度ごとの層分けを求めておらず、粒度で
   * 絞りたい側は `kind` で絞れる。分けること自体は可能（層の定義は
   * `layerOf` / `layerKeys` に 1 つあるだけで、複製されるのはバケットだけ）
   * だが、契約はコミット 1 で確定しており、後続が掴んだ形を変えない
   */
  nodesByLayer: ReadonlyMap<LayerKey, readonly GraphNode[]>
  /**
   * 層のキーの一覧。正本 JSON の並び + 層なしが 1 件あれば末尾。
   *
   * ノードが 1 件も属していない層も落とさない。層の存在は JSON が権威であり
   * （ADR-002）、「空だから無かったことにする」のはビューアによる判定にあたる
   */
  layerKeys: readonly LayerKey[]
  /**
   * 層のキーから層の定義を引く。`NO_LAYER` は定義を持たないため undefined。
   *
   * ノードが 1 件も属していない層も `layerKeys` に残るため、メンバーノード経由で
   * `layerOf` する迂回では定義を引けない。列見出しの名前（`name`）と、分類の根拠を
   * 人が確認するための glob（`match` / ADR-002 実装方針）は、ここから引く
   */
  layerOfKey: (key: LayerKey) => Layer | undefined

  /**
   * メソッドの所属。属性（`parent`）と引き当ての両方を持つ（UT-02 決定事項）。
   * 描画はノードの属性を見て、サイドバーはファイルから引く。
   */
  methodsOfFile: ReadonlyMap<string, readonly MethodNode[]>
  /** メソッドノード ID から所属ファイルノードを引く */
  fileOfMethod: (methodId: string) => FileNode | undefined

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
   * 空の検索語は 0 件を返す。「空なら全件」とするかは UT-11 の判断。
   *
   * `granularity` を省略すると全ノードを対象にする。ADR-003 が
   * 「現在の表示粒度に関わらず、検索対象は全ノードとする」と定めているため、
   * 横断の口を IR 側に持つ。粒度をまたいだ並びの規則を UT-11 に出さない
   */
  findByQuery: {
    (query: string, granularity: 'file'): readonly FileNode[]
    (query: string, granularity: 'method'): readonly MethodNode[]
    /** 粒度を状態として持つ側（UT-05）が、現在の粒度をそのまま渡せる形 */
    (query: string, granularity: Granularity): readonly GraphNode[]
    (query: string): readonly GraphNode[]
  }

  /**
   * 被依存数の降順で並べたノード（US-10）。同数のときは正本 JSON の並びを保つ。
   *
   * 並べ替えそのものは表示都合だが、**同数のときの規則**は誰が書いても同じ
   * 答えになるものであり、消費側が各々書くと同数ノードの並びがばらつく
   */
  nodesByFanInDesc: {
    (granularity: 'file'): readonly FileNode[]
    (granularity: 'method'): readonly MethodNode[]
    (granularity: Granularity): readonly GraphNode[]
  }

  /**
   * 依存先。ソース上の出現順に並べる（US-05 / C-7）。
   * via-interface のたどり方は options で選ぶ（既定は logical）
   */
  dependenciesOf: (
    nodeId: string,
    granularity: Granularity,
    options?: TraversalOptions,
  ) => readonly Dependency[]
  /**
   * 依存元。「このノードを使っているのは誰か」（US-14）。via は依存先と対称。
   *
   * **エッジ 1 本につき 1 件返す。** `fanInOf`（ノード数で数える）とは数え方が
   * 違い、同じ 2 ノード間に複数エッジがあれば件数のほうが多くなる。経路と
   * なったエッジを潰さないためであり、ノード単位で欲しい側は `node.id` で畳む
   */
  dependentsOf: (
    nodeId: string,
    granularity: Granularity,
    options?: TraversalOptions,
  ) => readonly Dependency[]
  /**
   * 依存元をノード単位に畳んだもの。既定の `logical` では件数が `fanInOf` と
   * 一致する。「いくつの箇所から使われているか」を数える側はこちらを使う
   */
  dependentNodesOf: (
    nodeId: string,
    granularity: Granularity,
    options?: TraversalOptions,
  ) => readonly GraphNode[]
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
    file: graph.nodes.filter((n): n is FileNode => n.kind === 'file'),
    method: graph.nodes.filter((n): n is MethodNode => n.kind === 'method'),
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
  // 定義されている層は、ノードが 0 件でもバケットを持たせる。
  // 「キーは `layerKeys` に在るのにバケットが無い」を消しておかないと、
  // 列を組む側（UT-08）が `layerKeys` を回すだけで undefined を踏む
  for (const layer of graph.layers) if (!nodesByLayer.has(layer.id)) nodesByLayer.set(layer.id, [])
  // 並び順はビューアが決める（`layers[]` は order を持たない設計 / ADR-002）。
  // ここでは正本 JSON の並びを保ち、層なしだけを末尾に置く。
  // ノードが 0 件の層も落とさない。層の存在は JSON が権威であり、
  // 「空だから出さない」は表示側の判断である
  const layerKeys: LayerKey[] = graph.layers.map((l) => l.id)
  if (nodesByLayer.has(NO_LAYER)) layerKeys.push(NO_LAYER)

  const methodsOfFile = groupBy(nodes.method, (n) => n.parent)

  const fanIn = buildFanInByGranularity(graph)
  const cyclesByNode = buildCyclesByNode(graph.cycles)
  const unresolved = buildUnresolvedIndex(graph.unresolved)
  const searchKeys = buildSearchKeys(graph.nodes, (id) => {
    const file = nodeById.get(id)
    return file?.kind === 'file' ? file.path : undefined
  })

  const traversal = buildTraversal(edges, nodeById)

  // 粒度の指定が無ければ全ノードを見る（ADR-003 の運用上の注意）。
  // 返る型は粒度で変わるため、宣言はオーバーロード（`ViewModel`）が持つ
  const findByQuery = ((query: string, granularity?: Granularity) =>
    (granularity ? nodes[granularity] : graph.nodes).filter((node) => {
      const key = searchKeys.get(node.id)
      return key ? matches(key, query) : false
    })) as ViewModel['findByQuery']

  // 返る型は粒度で変わるため、宣言はオーバーロード（`ViewModel`）が持つ
  const nodesByFanInDesc = ((granularity: Granularity) =>
    sortByFanInDesc<GraphNode>(
      nodes[granularity],
      fanIn[granularity],
    )) as ViewModel['nodesByFanInDesc']

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
    layerOfKey: (key) => (typeof key === 'string' ? layerById.get(key) : undefined),
    methodsOfFile,
    fileOfMethod: (methodId) => {
      const node = nodeById.get(methodId)
      if (node?.kind !== 'method') return undefined
      const file = nodeById.get(node.parent)
      return file?.kind === 'file' ? file : undefined
    },
    fanInOf: (nodeId, granularity) => fanIn[granularity].get(nodeId) ?? 0,
    cyclesOf: (nodeId) => cyclesByNode.get(nodeId) ?? [],
    unresolvedFrom: (nodeId) => unresolved.byOrigin.get(nodeId) ?? [],
    unresolvedCandidatesFor: (nodeId) => unresolved.byCandidate.get(nodeId) ?? [],
    searchKeyOf: (nodeId) => searchKeys.get(nodeId),
    findByQuery,
    nodesByFanInDesc,
    dependenciesOf: traversal.dependenciesOf,
    dependentsOf: traversal.dependentsOf,
    dependentNodesOf: traversal.dependentNodesOf,
  }
}
