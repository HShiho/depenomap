import * as v from 'valibot'

/**
 * 正本 JSON（依存関係グラフ）のスキーマ。
 *
 * 型と実行時検査を 1 つの定義から起こす（ADR-005）。
 * ここが扱うのは「JSON として妥当か」だけであり、
 * 依存関係の内容の良し悪しは一切判定しない（N-1）。
 *
 * 未知フィールドは `object()` の既定どおり読み飛ばす。
 * 「未知フィールドがあったこと」の報告は別経路で行う（UT-01 決定事項）。
 */

/** `meta` — スナップショットの素性 */
export const SnapshotSchema = v.object({
  label: v.string(),
  commit: v.string(),
  branch: v.string(),
})

export const MetaSchema = v.object({
  generatedAt: v.string(),
  /** 解析マシンの絶対パス。ノードの `path` はここからの相対 */
  rootDir: v.string(),
  tsconfig: v.string(),
  snapshot: SnapshotSchema,
})

/** `layers` — 層の定義。層は JSON が権威であり、ビューアは推測しない（ADR-002） */
export const LayerSchema = v.object({
  id: v.string(),
  name: v.string(),
  /** パス glob。抽出時に適用済みで、ビューアは再照合しない */
  match: v.array(v.string()),
})

/** `nodes` — ファイルとメソッド */
/**
 * ソース上の位置。
 *
 * 抽出側が 0-based の値に +1 して渡す（スキーマ §3）。US-19 のジャンプ先に
 * そのまま使うため、1 以上の整数であることを検査する。0 や負値、小数を
 * 通すと、エディタが開く位置が壊れる。
 */
const PositionSchema = v.pipe(v.number(), v.integer(), v.minValue(1))

const LocSchema = v.object({
  line: PositionSchema,
  column: PositionSchema,
})

export const FileNodeSchema = v.object({
  id: v.string(),
  kind: v.literal('file'),
  name: v.string(),
  /** `meta.rootDir` からの相対パス */
  path: v.string(),
  /** どの `match` にも当たらないノードが生じうる（ADR-002） */
  layer: v.optional(v.string()),
})

export const MethodNodeSchema = v.object({
  id: v.string(),
  kind: v.literal('method'),
  /** 所属ファイルノードの ID */
  parent: v.string(),
  name: v.string(),
  /** 囲むクラス／インターフェース。トップレベル関数では null */
  owner: v.nullable(v.string()),
  ownerKind: v.nullable(v.picklist(['class', 'interface'])),
  layer: v.optional(v.string()),
  loc: LocSchema,
})

/** `kind` による判別。メソッド固有フィールドが file ノードに現れない */
export const NodeSchema = v.variant('kind', [FileNodeSchema, MethodNodeSchema])

/** `edges` — 依存の実体 */
const EdgeBase = {
  id: v.string(),
  from: v.string(),
  to: v.string(),
}

export const ImportEdgeSchema = v.object({
  ...EdgeBase,
  kind: v.literal('import'),
  granularity: v.literal('file'),
  importKind: v.picklist(['type', 'value']),
  /** `moduleSpecifier` の生テキスト。エイリアスの元記述を保つ */
  specifier: v.string(),
})

export const ImplementsEdgeSchema = v.object({
  ...EdgeBase,
  kind: v.literal('implements'),
  granularity: v.literal('method'),
})

/** call / construct が共有するフィールド */
const CallLikeBase = {
  ...EdgeBase,
  granularity: v.literal('method'),
  /** `to` がインターフェースメンバーかによる分類 */
  resolution: v.picklist(['static', 'via-interface']),
  /** ソース上の出現順であって実行順ではない（C-7 / スキーマ §3） */
  sourceOrder: v.number(),
}

export const CallEdgeSchema = v.object({
  ...CallLikeBase,
  kind: v.literal('call'),
  /** `via-interface` のとき、自前解決した実装。`to` と併存させ潰さない */
  implementations: v.optional(v.array(v.string())),
})

export const ConstructEdgeSchema = v.object({
  ...CallLikeBase,
  kind: v.literal('construct'),
  implementations: v.optional(v.array(v.string())),
})

export const EdgeSchema = v.variant('kind', [
  ImportEdgeSchema,
  ImplementsEdgeSchema,
  CallEdgeSchema,
  ConstructEdgeSchema,
])

/** `unresolved` — 静的に追えなかったもの。違反ではない（N-1） */
export const UnresolvedSchema = v.object({
  id: v.string(),
  reason: v.string(),
  from: v.string(),
  expression: v.string(),
  /** ヒューリスティックな推測。確定情報と混ぜない */
  candidates: v.array(v.string()),
})

/** `cycles` — 循環依存。検出は抽出側の責務で、JSON が権威（スキーマ §4） */
export const CycleSchema = v.object({
  id: v.string(),
  nodes: v.array(v.string()),
  edges: v.array(v.string()),
  /**
   * 型のみの循環かどうか。良し悪しではなく循環の性質という事実（N-1）。
   *
   * import の `importKind` に由来する概念のため、file 粒度の循環にしか現れない。
   * メソッド呼び出しの循環には「型のみ」が存在せず、フィールドごと欠ける。
   */
  typeOnly: v.optional(v.boolean()),
})

/** 正本 JSON 全体 */
export const DependencyGraphSchema = v.object({
  schemaVersion: v.string(),
  meta: MetaSchema,
  layers: v.array(LayerSchema),
  nodes: v.array(NodeSchema),
  edges: v.array(EdgeSchema),
  unresolved: v.array(UnresolvedSchema),
  cycles: v.array(CycleSchema),
})

export type DependencyGraph = v.InferOutput<typeof DependencyGraphSchema>
export type GraphNode = v.InferOutput<typeof NodeSchema>
export type FileNode = v.InferOutput<typeof FileNodeSchema>
export type MethodNode = v.InferOutput<typeof MethodNodeSchema>
export type GraphEdge = v.InferOutput<typeof EdgeSchema>
export type Layer = v.InferOutput<typeof LayerSchema>
export type Unresolved = v.InferOutput<typeof UnresolvedSchema>
export type Cycle = v.InferOutput<typeof CycleSchema>
