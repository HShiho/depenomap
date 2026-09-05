import { IDENTITY_FIELDS, REFERENCE_FIELDS } from './fields'
import type { DependencyGraph } from './schema'

/**
 * 参照整合性の検査。
 *
 * ID を指すフィールドが、実在する ID を指しているかだけを見る。
 * 依存関係の内容の良し悪しは一切判定しない（N-1）。判定しているのは
 * 「データとして壊れているか」であり、構成の善し悪しではない。
 *
 * 違反があれば読み込み全体を拒否する（UT-01 決定事項）。該当要素だけを
 * 落とすと UT-02 の被依存数や UT-13 の件数が静かにずれ、利用者が
 * 「依存が無い」と誤読するため。
 */

/**
 * 違反の種別は、フィールドの分類（`fields.ts`）からそのまま導く。
 * 種別名は正規化パスであり、分類を足せば種別が増える。
 *
 * 種別が増えるとテーブル駆動テストがその種別の検査を要求するため、
 * 「分類したが検査していない」状態はテストが通らない。
 */
export const REFERENCE_KINDS = Object.keys(REFERENCE_FIELDS) as ReferenceKind[]

/**
 * ID の一意性を検査する対象。
 *
 * ID はスキーマ §4 で「UI 状態保持の鍵」と位置づけられている（US-17 の
 * ノード位置、US-13 の戻る／進む）。重複すると UT-02 の被依存数と
 * UT-17 のレイアウトが静かに壊れるため、参照の欠落とは別に検査する。
 */
export const DUPLICATE_KINDS = IDENTITY_FIELDS

export type ReferenceKind = keyof typeof REFERENCE_FIELDS
export type DuplicateKind = (typeof IDENTITY_FIELDS)[number]
export type ViolationKind = ReferenceKind | DuplicateKind

/** 全違反種別。参照の欠落と ID の重複を同じ枠で扱う */
export const VIOLATION_KINDS: readonly ViolationKind[] = [...REFERENCE_KINDS, ...DUPLICATE_KINDS]

/** 種別ごとに返す違反の上限。超えた分は件数だけを伝える */
export const MAX_VIOLATIONS_PER_KIND = 10

/**
 * 違反の理由。
 *
 * `wrong-kind` は「実在はするが、種類が違うノードを指している」。
 * 依存関係の良し悪しではなくデータの破損であり、N-1 には抵触しない。
 * 検査するのはスキーマが種類を明記している参照だけに限る。
 */
export type ViolationReason = 'missing' | 'wrong-kind' | 'duplicate'

export interface IntegrityViolation {
  kind: ViolationKind
  reason: ViolationReason
  /**
   * 問題のある位置。実添字をブラケットで示す（`edges[3].from` / `cycles[2].id`）。
   * スキーマ検査のエラーと同じ表記に揃えてある（UT-01 決定事項）。
   */
  at: string
  /** 問題の ID。参照の欠落なら実在しなかった参照先、重複なら重複した ID */
  id: string
  /** `wrong-kind` のとき、期待したノードの種類 */
  expected?: 'file' | 'method'
}

export interface IntegrityReport {
  /** 種別ごとの違反。それぞれ MAX_VIOLATIONS_PER_KIND 件まで */
  violations: IntegrityViolation[]
  /** 種別ごとの総件数。打ち切られていても実数が入る */
  totals: Record<ViolationKind, number>
  /** 総件数の合計。0 なら整合性が取れている */
  total: number
  /** いずれかの種別が上限で打ち切られたか */
  truncated: boolean
}

/** 参照元 1 種別ぶんの走査結果を貯める */
class ViolationBucket {
  private readonly kept: IntegrityViolation[] = []
  private count = 0

  constructor(private readonly kind: ViolationKind) {}

  add(reason: ViolationReason, at: string, id: string, expected?: 'file' | 'method'): void {
    this.count += 1
    if (this.kept.length < MAX_VIOLATIONS_PER_KIND) {
      this.kept.push(
        expected
          ? { kind: this.kind, reason, at, id, expected }
          : { kind: this.kind, reason, at, id },
      )
    }
  }

  get total(): number {
    return this.count
  }

  get truncated(): boolean {
    return this.count > this.kept.length
  }

  drain(): IntegrityViolation[] {
    return this.kept
  }
}

/**
 * グラフ全体の参照整合性を検査する。
 *
 * 全件を走査したうえで、種別ごとに上限まで返す。最初の違反で打ち切らないのは、
 * 壊れた JSON を直す側に全体像を先に見せるため。
 */
export function checkIntegrity(graph: DependencyGraph): IntegrityReport {
  const edgeIds = new Set(graph.edges.map((e) => e.id))
  const layerIds = new Set(graph.layers.map((l) => l.id))

  const buckets = new Map<ViolationKind, ViolationBucket>(
    VIOLATION_KINDS.map((kind) => [kind, new ViolationBucket(kind)]),
  )
  const bucket = (kind: ViolationKind): ViolationBucket => buckets.get(kind)!

  const nodeKinds = new Map(graph.nodes.map((n) => [n.id, n.kind]))

  /**
   * ノードを参照する。`expected` を渡すと、実在に加えて種類も見る。
   * 種類の期待はスキーマが明記しているものだけに限る（UT-01 決定事項）。
   */
  const requireNode = (
    kind: ReferenceKind,
    at: string,
    id: string,
    expected?: 'file' | 'method',
  ): void => {
    const actual = nodeKinds.get(id)
    if (actual === undefined) return bucket(kind).add('missing', at, id)
    if (expected && actual !== expected) bucket(kind).add('wrong-kind', at, id, expected)
  }
  const requireEdge = (kind: ReferenceKind, at: string, id: string): void => {
    if (!edgeIds.has(id)) bucket(kind).add('missing', at, id)
  }
  const requireLayer = (kind: ReferenceKind, at: string, id: string): void => {
    if (!layerIds.has(id)) bucket(kind).add('missing', at, id)
  }

  /**
   * 同じ ID が 2 回目以降に現れたら重複として記録する。
   * `at` には 2 件目以降の位置を入れる。どれを直せばよいかが分かる形にする。
   */
  const collectDuplicates = (kind: DuplicateKind, section: string, ids: string[]): void => {
    const seen = new Set<string>()
    ids.forEach((id, index) => {
      if (seen.has(id)) bucket(kind).add('duplicate', `${section}[${index}].id`, id)
      else seen.add(id)
    })
  }

  collectDuplicates(
    'nodes[].id',
    'nodes',
    graph.nodes.map((n) => n.id),
  )
  collectDuplicates(
    'edges[].id',
    'edges',
    graph.edges.map((e) => e.id),
  )
  collectDuplicates(
    'cycles[].id',
    'cycles',
    graph.cycles.map((c) => c.id),
  )
  collectDuplicates(
    'unresolved[].id',
    'unresolved',
    graph.unresolved.map((u) => u.id),
  )
  collectDuplicates(
    'layers[].id',
    'layers',
    graph.layers.map((l) => l.id),
  )

  graph.edges.forEach((edge, i) => {
    // エッジの両端は granularity と同じ種類のノードでなければならない（スキーマ §3）
    requireNode('edges[].from', `edges[${i}].from`, edge.from, edge.granularity)
    requireNode('edges[].to', `edges[${i}].to`, edge.to, edge.granularity)
    if (edge.kind === 'call' || edge.kind === 'construct') {
      edge.implementations?.forEach((id, j) => {
        // implements グラフからの逆引きであり、指す先はメソッド（スキーマ §3 の例示）
        requireNode('edges[].implementations[]', `edges[${i}].implementations[${j}]`, id, 'method')
      })
    }
  })

  graph.nodes.forEach((node, i) => {
    // 所属ファイルノードの ID（スキーマ §3）
    if (node.kind === 'method')
      requireNode('nodes[].parent', `nodes[${i}].parent`, node.parent, 'file')
    // 層は JSON が権威であり、ビューアは推測しない（ADR-002）。
    // 実在しない層 ID は UT-04 の列生成と US-04 の分類を壊す
    if (node.layer !== undefined) requireLayer('nodes[].layer', `nodes[${i}].layer`, node.layer)
  })

  graph.cycles.forEach((cycle, i) => {
    cycle.nodes.forEach((id, j) => requireNode('cycles[].nodes[]', `cycles[${i}].nodes[${j}]`, id))
    cycle.edges.forEach((id, j) => requireEdge('cycles[].edges[]', `cycles[${i}].edges[${j}]`, id))
  })

  graph.unresolved.forEach((item, i) => {
    // 追えなくなった箇所は「呼び出し元メソッド」（スキーマ §3）
    requireNode('unresolved[].from', `unresolved[${i}].from`, item.from, 'method')
    // candidates は種類を見ない。スキーマ §3 は「ヒューリスティックな推測」と
    // 書くだけで種類を明記しておらず、動的 import() の候補はモジュール
    // （file ノード）を指すのが自然である（§6）。種類を強制すると、
    // 正しいグラフを丸ごと拒否しうる
    item.candidates.forEach((id, j) =>
      requireNode('unresolved[].candidates[]', `unresolved[${i}].candidates[${j}]`, id),
    )
  })

  const violations: IntegrityViolation[] = []
  const totals = {} as Record<ViolationKind, number>
  let truncated = false

  for (const kind of VIOLATION_KINDS) {
    const b = bucket(kind)
    violations.push(...b.drain())
    totals[kind] = b.total
    if (b.truncated) truncated = true
  }

  return {
    violations,
    totals,
    total: Object.values(totals).reduce((a, b) => a + b, 0),
    truncated,
  }
}
