/**
 * 列の割り当て（UT-06 / UT-08）。
 *
 * ノードをどの列に置くか、その列の見出しに何を出すかを決める。**並べる軸で
 * 変わるのはここだけ**で、配置そのもの（`layout.ts`）は列番号を受け取って
 * 詰めるだけにしてある。
 *
 * 純粋関数に出してあるのは、軸ごとの割り当てを描画抜きで検査できるように
 * するため。
 */

import type { GraphNode } from '@/core/graph/schema'
import { NO_LAYER, type LayerKey, type ViewModel } from '@/core/ir/view-model'

/** 層カラーは 6 色を循環させる。層 ID には結び付けない（UT-04 の決定） */
const LAYER_COLOURS = 6

/**
 * 最後尾へ寄せる列。層が未設定のノードがここへ来る。
 *
 * 層が無いこと自体は欠陥ではない（ADR-002 / N-1）。列番号は `layout.ts` が
 * 詰め直すため、実際に空く列はできない。
 */
export const TRAILING_COLUMN = Number.MAX_SAFE_INTEGER

/** 列の見出し */
export interface ColumnHead {
  /** 列の名前 */
  label: string
  /** 見出しの色。層の色帯と同じ */
  colour: string
}

export interface ColumnPlan {
  /** ノードを置く列。番号の間隔に意味はなく、大小だけが並び順を決める */
  columnOf: (node: GraphNode) => number
  /** 列の見出し */
  headOf: (column: number) => ColumnHead
}

/**
 * 層を列にする割り当て（ADR-002）。
 *
 * 列の並びは**正本 JSON の `layers` の並び**をそのまま使う。JSON は層の順序を
 * 規定しない（`layers[].order` を持たない — スキーマ §3）ため、並べ方の根拠を
 * ビューアが別に持つと、正本を書き換えても並びが変わらないことになる。
 */
export function layerColumns(viewModel: ViewModel): ColumnPlan {
  const columnOfLayer = new Map<LayerKey, number>(
    viewModel.layerKeys.map((key, index) => [key, index]),
  )

  return {
    columnOf: (node) => columnOfLayer.get(viewModel.layerOf(node.id).key) ?? TRAILING_COLUMN,
    headOf: (column) => {
      const key = viewModel.layerKeys[column]
      const layer = key === undefined ? undefined : viewModel.layerOfKey(key)
      return { label: layer?.name ?? '層なし', colour: colourOfLayerKey(key, columnOfLayer) }
    },
  }
}

/**
 * 層の色を引く口。**並べる軸に依らない**。
 *
 * 列が深度になってもノードの層は変わらないため、色帯は層の色のままにする。
 */
export function layerColours(viewModel: ViewModel): (key: LayerKey | undefined) => string {
  const columnOfLayer = new Map<LayerKey, number>(
    viewModel.layerKeys.map((key, index) => [key, index]),
  )
  return (key) => colourOfLayerKey(key, columnOfLayer)
}

function colourOfLayerKey(
  key: LayerKey | undefined,
  columnOfLayer: ReadonlyMap<LayerKey, number>,
): string {
  if (key === undefined || key === NO_LAYER) return 'var(--color-ink-3)'
  const index = columnOfLayer.get(key) ?? 0
  return `var(--color-layer-${(index % LAYER_COLOURS) + 1})`
}
