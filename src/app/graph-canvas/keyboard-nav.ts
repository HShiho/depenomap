/**
 * 図の上でのキーボードの焦点の移動（UT-21 / QR-2）。
 *
 * 焦点の位置は 1 つ（ローヴィング tabindex）。Tab では図へ入るだけで、図の中は
 * 矢印キーで動く。ここは**どこからどこへ動くか**だけを決める純粋関数で、
 * 描画にも焦点の当て方にも触れない。
 *
 *   - ↑↓: 列の中を、縦の位置の順に
 *   - ←→: 隣に描かれている列へ。縦の位置が一番近いノードに
 *   - Home / End: 列の先頭・末尾へ
 *
 * 列の軸（層 / 依存深度）が変わっても同じ割り当て。列は配置（`layout.ts`）が
 * 決めた列番号で分け、空の列は配置の時点で詰められている。縦の位置は手で動かした
 * あとの位置で数える（見えている並びと、矢印で動く順を揃える）。
 *
 * 端では止まり、反対側へ回り込まない。回り込むと、端に着いたことが分からない。
 *
 * 一覧（N-4）は作らない。動けるのは図に描かれているノードの間だけ。
 */

/** 移動の計算に要る、配置済みのノードの形 */
export interface NavNode {
  id: string
  /** 配置が決めた列番号。空の列は詰められていて、番号は飛ぶことがある */
  column: number
  /** 縦の位置（手で動かしたあと） */
  y: number
}

export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'

export const NAV_KEYS: readonly NavKey[] = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]

/** 列ごとに、縦の位置の順に並べたもの。列は左から */
function columnsOf(nodes: readonly NavNode[]): NavNode[][] {
  const byColumn = new Map<number, NavNode[]>()
  for (const node of nodes) {
    const bucket = byColumn.get(node.column)
    if (bucket) bucket.push(node)
    else byColumn.set(node.column, [node])
  }
  return [...byColumn.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) => bucket.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id)))
}

/** 先頭のノード（左の列の一番上） */
function firstOf(columns: readonly NavNode[][]): string | undefined {
  return columns[0]?.[0]?.id
}

/**
 * 次に焦点を当てるノード。図にノードが無ければ `undefined`。
 *
 * 焦点が図に無い（まだ当てていない、組み換えで消えた）ときは、先頭から始める。
 */
export function nextFocus(
  nodes: readonly NavNode[],
  currentId: string | undefined,
  key: NavKey,
): string | undefined {
  const columns = columnsOf(nodes)
  const columnIndex = columns.findIndex((column) => column.some((node) => node.id === currentId))
  if (columnIndex === -1) return firstOf(columns)

  const column = columns[columnIndex]!
  const row = column.findIndex((node) => node.id === currentId)
  const current = column[row]!

  switch (key) {
    case 'ArrowUp':
      return column[Math.max(0, row - 1)]!.id
    case 'ArrowDown':
      return column[Math.min(column.length - 1, row + 1)]!.id
    case 'Home':
      return column[0]!.id
    case 'End':
      return column[column.length - 1]!.id
    case 'ArrowLeft':
    case 'ArrowRight': {
      const target = columns[columnIndex + (key === 'ArrowLeft' ? -1 : 1)]
      if (target === undefined) return current.id
      // 縦の位置が一番近いもの。同じ距離なら上（並びの先）を選び、押すたびに揺れない
      let nearest = target[0]!
      for (const node of target) {
        if (Math.abs(node.y - current.y) < Math.abs(nearest.y - current.y)) nearest = node
      }
      return nearest.id
    }
  }
}

/**
 * 図が組み換わったとき（粒度・並べ方・絞り込み）の焦点の行き先（UT-21 の決定）。
 *
 * 直前に焦点を当てていたノードが残っていればそのまま。消えていれば選択中の
 * ノード、それも無ければ先頭。焦点が行方不明にならないようにする。
 */
export function focusAfterRebuild(
  nodes: readonly NavNode[],
  previousId: string | undefined,
  selectedId: string | undefined,
): string | undefined {
  const present = (id: string | undefined) => id !== undefined && nodes.some((n) => n.id === id)
  if (present(previousId)) return previousId
  if (present(selectedId)) return selectedId
  return firstOf(columnsOf(nodes))
}

/** 読み上げに出す位置（1 から数える）。描かれている列だけで数える */
export interface GridPosition {
  column: number
  columns: number
  row: number
  rows: number
}

export function gridPositionOf(nodes: readonly NavNode[], id: string): GridPosition | undefined {
  const columns = columnsOf(nodes)
  for (const [columnIndex, column] of columns.entries()) {
    const row = column.findIndex((node) => node.id === id)
    if (row !== -1) {
      return { column: columnIndex + 1, columns: columns.length, row: row + 1, rows: column.length }
    }
  }
  return undefined
}
