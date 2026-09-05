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
 * 違反の種別。
 *
 * `edges.implementations` は当初の 7 種別に含まれていなかったが、これも
 * ノード ID の配列であり、UT-02 の「論理依存／実依存の切り替え」がそのまま
 * 使う。壊れていれば実依存が黙って空になるため、検査対象に含める。
 */
export const REFERENCE_KINDS = [
  'edges.from',
  'edges.to',
  'edges.implementations',
  'nodes.parent',
  'cycles.nodes',
  'cycles.edges',
  'unresolved.from',
  'unresolved.candidates',
] as const

/**
 * ID の一意性を検査する対象。
 *
 * ID はスキーマ §4 で「UI 状態保持の鍵」と位置づけられている（US-17 の
 * ノード位置、US-13 の戻る／進む）。重複すると UT-02 の被依存数と
 * UT-17 のレイアウトが静かに壊れるため、参照の欠落とは別に検査する。
 */
export const DUPLICATE_KINDS = ['nodes.id', 'edges.id', 'cycles.id', 'unresolved.id'] as const

export type ReferenceKind = (typeof REFERENCE_KINDS)[number]
export type DuplicateKind = (typeof DUPLICATE_KINDS)[number]
export type ViolationKind = ReferenceKind | DuplicateKind

/** 全違反種別。参照の欠落と ID の重複を同じ枠で扱う */
export const VIOLATION_KINDS = [...REFERENCE_KINDS, ...DUPLICATE_KINDS] as const

/** 種別ごとに返す違反の上限。超えた分は件数だけを伝える */
export const MAX_VIOLATIONS_PER_KIND = 10

export interface IntegrityViolation {
  kind: ViolationKind
  /** 参照元の要素の ID（`edges[].id` など）。重複の場合は重複した ID そのもの */
  at: string
  /** 実在しなかった参照先の ID。重複の場合は重複した ID そのもの */
  missing: string
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

  add(at: string, missing: string): void {
    this.count += 1
    if (this.kept.length < MAX_VIOLATIONS_PER_KIND) {
      this.kept.push({ kind: this.kind, at, missing })
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
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  const edgeIds = new Set(graph.edges.map((e) => e.id))

  const buckets = new Map<ViolationKind, ViolationBucket>(
    VIOLATION_KINDS.map((kind) => [kind, new ViolationBucket(kind)]),
  )
  const bucket = (kind: ViolationKind): ViolationBucket => buckets.get(kind)!

  const requireNode = (kind: ReferenceKind, at: string, id: string): void => {
    if (!nodeIds.has(id)) bucket(kind).add(at, id)
  }
  const requireEdge = (kind: ReferenceKind, at: string, id: string): void => {
    if (!edgeIds.has(id)) bucket(kind).add(at, id)
  }

  /** 同じ ID が 2 回目以降に現れたら重複として記録する */
  const collectDuplicates = (kind: DuplicateKind, ids: string[]): void => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) bucket(kind).add(id, id)
      else seen.add(id)
    }
  }

  collectDuplicates(
    'nodes.id',
    graph.nodes.map((n) => n.id),
  )
  collectDuplicates(
    'edges.id',
    graph.edges.map((e) => e.id),
  )
  collectDuplicates(
    'cycles.id',
    graph.cycles.map((c) => c.id),
  )
  collectDuplicates(
    'unresolved.id',
    graph.unresolved.map((u) => u.id),
  )

  for (const edge of graph.edges) {
    requireNode('edges.from', edge.id, edge.from)
    requireNode('edges.to', edge.id, edge.to)
    if (edge.kind === 'call' || edge.kind === 'construct') {
      for (const id of edge.implementations ?? []) {
        requireNode('edges.implementations', edge.id, id)
      }
    }
  }

  for (const node of graph.nodes) {
    if (node.kind === 'method') requireNode('nodes.parent', node.id, node.parent)
  }

  for (const cycle of graph.cycles) {
    for (const id of cycle.nodes) requireNode('cycles.nodes', cycle.id, id)
    for (const id of cycle.edges) requireEdge('cycles.edges', cycle.id, id)
  }

  for (const item of graph.unresolved) {
    requireNode('unresolved.from', item.id, item.from)
    for (const id of item.candidates) requireNode('unresolved.candidates', item.id, id)
  }

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
