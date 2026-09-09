/**
 * ノードの配置を決める（UT-06）。
 *
 * **列を決める規則を受け取り、座標を返す純粋関数**にしてある。UT-08 は列の
 * 決め方（層 / 依存深度）だけを差し替え、UT-17 は結果の座標を上書きする。
 * 描画（`GraphCanvas.vue`）は決まった座標を描くだけで、配置の判断を持たない。
 *
 * 寸法と並べ方は参照仕様（`plan/inception/mockup.html`）から取っている。
 */

import type { GraphEdge, GraphNode } from '@/core/graph/schema'

/** ノードの実寸。参照仕様の `NW` / `NH` */
export const NODE_WIDTH = 226
export const NODE_HEIGHT = 54

/** 列の間隔・行の間隔と、図の左上の余白 */
export const COLUMN_WIDTH = 320
export const ROW_HEIGHT = 82
export const PADDING_X = 40
export const PADDING_Y = 74

/** 列内の並べ替えを何回繰り返すか。増やしても交差はほとんど減らない */
const SWEEPS = 4

export interface PlacedNode {
  node: GraphNode
  /** 列の並び順。同じ列に入るノードは同じ値を持つ */
  column: number
  x: number
  y: number
}

export interface LayoutColumn {
  column: number
  x: number
  /** この列に入ったノードの数 */
  count: number
}

export interface Layout {
  nodes: readonly PlacedNode[]
  columns: readonly LayoutColumn[]
  /** 図全体の大きさ。全体表示（fit）の計算に使う */
  width: number
  height: number
}

export interface LayoutInput {
  nodes: readonly GraphNode[]
  edges: readonly GraphEdge[]
  /**
   * ノードを列へ割り当てる規則。UT-08 が層と依存深度を差し替える。
   * 同じ値を返したノードが同じ列に並び、値の小さい順に左から置く
   */
  columnOf: (node: GraphNode) => number
  /** 列の中の初期の並び。既定はパス順（安定していて、人が探しやすい） */
  sortKeyOf?: (node: GraphNode) => string
}

function defaultSortKey(node: GraphNode): string {
  return node.kind === 'file' ? node.path : `${node.parent}#${node.name}`
}

/**
 * 列の中を並べ替えて、線の交差を減らす（重心法）。
 *
 * つながっている相手の行位置の平均へ寄せる。左からと右からを交互に繰り返すと、
 * 端の列だけが揃って中央が乱れる状態になりにくい。
 *
 * **厳密な最小化はしない。** 交差数の最小化は NP 困難であり、読めれば十分な
 * 図に対してその計算を払う理由がない。
 */
function reduceCrossings(
  columns: readonly number[],
  byColumn: Map<number, GraphNode[]>,
  edges: readonly GraphEdge[],
): void {
  const neighbours = new Map<string, string[]>()
  const link = (from: string, to: string) => {
    const list = neighbours.get(from)
    if (list) list.push(to)
    else neighbours.set(from, [to])
  }
  for (const edge of edges) {
    link(edge.from, edge.to)
    link(edge.to, edge.from)
  }

  const rowOf = new Map<string, number>()
  const readRows = () => {
    for (const column of columns) {
      byColumn.get(column)?.forEach((node, index) => rowOf.set(node.id, index))
    }
  }
  readRows()

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const order = sweep % 2 === 0 ? columns : [...columns].reverse()
    for (const column of order) {
      const nodes = byColumn.get(column)
      if (!nodes || nodes.length < 2) continue

      const centre = new Map<string, number>()
      nodes.forEach((node, index) => {
        const rows = (neighbours.get(node.id) ?? [])
          .map((id) => rowOf.get(id))
          .filter((row): row is number => row !== undefined)
        // つながる相手がいないノードは、いまの位置を保つ
        centre.set(
          node.id,
          rows.length === 0 ? index : rows.reduce((a, b) => a + b, 0) / rows.length,
        )
      })

      nodes.sort((a, b) => (centre.get(a.id) ?? 0) - (centre.get(b.id) ?? 0))
      readRows()
    }
  }
}

/**
 * 配置を決める。
 *
 * 列は**中身のあるものだけを詰めて**並べる。空の列を残すと、絞り込み（UT-14）で
 * ノードが消えたときに図が横へ間延びする。層の一覧そのものは列見出し側（UT-08）が
 * 持つため、ここで空の列を保つ必要はない。
 */
export function buildLayout(input: LayoutInput): Layout {
  const sortKey = input.sortKeyOf ?? defaultSortKey

  const byColumn = new Map<number, GraphNode[]>()
  for (const node of input.nodes) {
    const column = input.columnOf(node)
    const bucket = byColumn.get(column)
    if (bucket) bucket.push(node)
    else byColumn.set(column, [node])
  }

  const columns = [...byColumn.keys()].sort((a, b) => a - b)
  for (const column of columns) {
    byColumn.get(column)?.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  }
  reduceCrossings(columns, byColumn, input.edges)

  const xOf = new Map(columns.map((column, index) => [column, PADDING_X + index * COLUMN_WIDTH]))

  const placed: PlacedNode[] = []
  for (const column of columns) {
    byColumn.get(column)?.forEach((node, row) => {
      placed.push({
        node,
        column,
        x: xOf.get(column)!,
        y: PADDING_Y + row * ROW_HEIGHT,
      })
    })
  }

  const rows = Math.max(0, ...columns.map((column) => byColumn.get(column)?.length ?? 0))
  return {
    nodes: placed,
    columns: columns.map((column) => ({
      column,
      x: xOf.get(column)!,
      count: byColumn.get(column)?.length ?? 0,
    })),
    width:
      columns.length === 0 ? 0 : PADDING_X * 2 + (columns.length - 1) * COLUMN_WIDTH + NODE_WIDTH,
    height: rows === 0 ? 0 : PADDING_Y + (rows - 1) * ROW_HEIGHT + NODE_HEIGHT + PADDING_X,
  }
}
