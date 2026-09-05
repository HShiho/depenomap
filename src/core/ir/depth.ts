import type { GraphEdge } from '../graph/schema'
import type { Granularity, ViewModel } from './view-model'

/**
 * 依存深度の算出（ADR-001）。
 *
 * 起点から依存の向き（使う側 → 使われる側）にたどった距離を深度とする。
 * 起点は 2 通りあるが、**算出ロジックは共通**である。
 *
 * - 未選択時 — 被依存数 0 のノード群。他のどこからも使われていないノードで、
 *   アプリケーションの入口に相当する。グラフの形だけから一意に決まる
 * - 選択時 — 選択中のノード 1 件
 *
 * どの起点からも到達できないノードが生じうる。それらは「深度未定」として
 * 区別する。列の最後尾へ寄せるのはビュー側の判断であり、ここでは良し悪しを
 * 判定しない（N-1）。
 *
 * キャッシュは持たない（UT-02 決定事項）。起点は選択のたびに変わるため、
 * 無効化の条件を持つコストのほうが高く、古い値を返すバグの余地も生む。
 */

/** 深度が定まらないノードを表す。0 と混同しないよう Symbol を使う */
export const DEPTH_UNDEFINED = Symbol('深度未定')
export type Depth = number | typeof DEPTH_UNDEFINED

export interface DepthResult {
  /** ノード ID → 深度。到達できなかったノードは `DEPTH_UNDEFINED` */
  depthOf: (nodeId: string) => Depth
  /** 起点として使われたノード ID */
  origins: readonly string[]
  /** 到達できた最大の深度。起点が無ければ undefined */
  maxDepth: number | undefined
  /** 到達できなかったノードの ID */
  unreachable: readonly string[]
}

/** 依存の向きに沿った隣接リストを組む */
function buildAdjacency(edges: readonly GraphEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const bucket = adjacency.get(edge.from)
    if (bucket) bucket.push(edge.to)
    else adjacency.set(edge.from, [edge.to])
  }
  return adjacency
}

/**
 * 被依存数 0 のノード群を求める（未選択時の起点 / ADR-001）。
 *
 * 「他のどこからも使われていない」を、その粒度のエッジの `to` に一度も
 * 現れないことで判定する。
 */
export function findRootOrigins(viewModel: ViewModel, granularity: Granularity): string[] {
  const used = new Set(viewModel.edges[granularity].map((e) => e.to))
  return viewModel.nodes[granularity].filter((n) => !used.has(n.id)).map((n) => n.id)
}

/**
 * 起点集合から深度を算出する。
 *
 * 起点の決め方（未選択か選択中か）は呼び出し側の判断であり、ここは
 * 受け取った集合を等しく深度 0 として扱う。ADR-001 が「算出ロジックは共通」
 * と定めているのはこの形を指す。
 */
export function computeDepths(
  viewModel: ViewModel,
  granularity: Granularity,
  origins: readonly string[],
): DepthResult {
  const adjacency = buildAdjacency(viewModel.edges[granularity])
  const nodeIds = viewModel.nodes[granularity].map((n) => n.id)
  const known = new Set(nodeIds)

  // 起点はその粒度に実在するものだけを採る。粒度を跨いだ ID を渡されても壊れない
  const usedOrigins = [...new Set(origins.filter((id) => known.has(id)))]

  const depths = new Map<string, number>()
  const queue = [...usedOrigins]
  for (const id of usedOrigins) depths.set(id, 0)

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!
    const currentDepth = depths.get(current)!
    for (const next of adjacency.get(current) ?? []) {
      if (!known.has(next) || depths.has(next)) continue
      depths.set(next, currentDepth + 1)
      queue.push(next)
    }
  }

  const unreachable = nodeIds.filter((id) => !depths.has(id))
  const reached = [...depths.values()]

  return {
    depthOf: (nodeId) => depths.get(nodeId) ?? DEPTH_UNDEFINED,
    origins: usedOrigins,
    maxDepth: reached.length > 0 ? Math.max(...reached) : undefined,
    unreachable,
  }
}
