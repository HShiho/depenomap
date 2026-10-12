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
/**
 * 移動の計算に使う索引。**図が組み換わったときに 1 回だけ作る**（R1-05）。
 *
 * キーを押すたびに全ノードを列に分けて並べ直すと、キーを押し続けたとき（自動
 * 反復）に、数千ノードではその計算を反復のたびに払う。列の並びと、ノードから
 * 列・行への引き当てを前もって持つ。
 */
export interface NavIndex {
  /** 列ごとに、縦の位置の順に並べたもの。列は左から */
  columns: readonly (readonly NavNode[])[]
  /** ノードの ID から、列と行の位置（0 から） */
  at: ReadonlyMap<string, { column: number; row: number }>
}

export function buildNavIndex(nodes: readonly NavNode[]): NavIndex {
  const byColumn = new Map<number, NavNode[]>()
  for (const node of nodes) {
    const bucket = byColumn.get(node.column)
    if (bucket) bucket.push(node)
    else byColumn.set(node.column, [node])
  }
  const columns = [...byColumn.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) => bucket.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id)))

  const at = new Map<string, { column: number; row: number }>()
  for (const [column, bucket] of columns.entries()) {
    for (const [row, node] of bucket.entries()) at.set(node.id, { column, row })
  }
  return { columns, at }
}

/** 先頭のノード（左の列の一番上） */
function firstOf(index: NavIndex): string | undefined {
  return index.columns[0]?.[0]?.id
}

/**
 * 次に焦点を当てるノード。図にノードが無ければ `undefined`。
 *
 * 焦点が図に無い（まだ当てていない、組み換えで消えた）ときは、先頭から始める。
 */
export function nextFocus(
  index: NavIndex,
  currentId: string | undefined,
  key: NavKey,
): string | undefined {
  const here = currentId === undefined ? undefined : index.at.get(currentId)
  if (here === undefined) return firstOf(index)

  const column = index.columns[here.column]!
  const current = column[here.row]!

  switch (key) {
    case 'ArrowUp':
      return column[Math.max(0, here.row - 1)]!.id
    case 'ArrowDown':
      return column[Math.min(column.length - 1, here.row + 1)]!.id
    case 'Home':
      return column[0]!.id
    case 'End':
      return column[column.length - 1]!.id
    case 'ArrowLeft':
    case 'ArrowRight': {
      const target = index.columns[here.column + (key === 'ArrowLeft' ? -1 : 1)]
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
  index: NavIndex,
  previousId: string | undefined,
  selectedId: string | undefined,
): string | undefined {
  if (previousId !== undefined && index.at.has(previousId)) return previousId
  if (selectedId !== undefined && index.at.has(selectedId)) return selectedId
  return firstOf(index)
}

/** 読み上げに出す位置（1 から数える）。描かれている列だけで数える */
export interface GridPosition {
  column: number
  columns: number
  row: number
  rows: number
}

export function gridPositionOf(index: NavIndex, id: string): GridPosition | undefined {
  const here = index.at.get(id)
  if (here === undefined) return undefined
  return {
    column: here.column + 1,
    columns: index.columns.length,
    row: here.row + 1,
    rows: index.columns[here.column]!.length,
  }
}
