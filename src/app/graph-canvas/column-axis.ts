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
import { computeDepths, DEPTH_UNDEFINED, findRootOrigins } from '@/core/ir/depth'
import { NO_LAYER, type Granularity, type LayerKey, type ViewModel } from '@/core/ir/view-model'
import type { ColumnAxis } from '../shell/view-state'

/** 層カラーは 6 色を循環させる。層 ID には結び付けない（UT-04 の決定） */
const LAYER_COLOURS = 6

/**
 * 最後尾へ寄せる列。層が未設定のノードと、深度が定まらないノードがここへ来る。
 *
 * 層が無いこと・起点からたどり着けないこと自体は欠陥ではない
 * （ADR-001 / ADR-002 / N-1）。列番号は `layout.ts` が詰め直すため、
 * 実際に空く列はできない。
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
 * 現在の軸に応じた割り当てを組む（US-04）。
 *
 * **どちらも「並べる軸」であって、表示範囲を絞る手段ではない**（N-2）。
 * 深度を指定して出し入れする操作は置かない。
 */
export function buildColumnPlan(input: {
  viewModel: ViewModel
  granularity: Granularity
  axis: ColumnAxis
  selectedNodeId: string | undefined
}): ColumnPlan {
  if (input.axis === 'layer') return layerColumns(input.viewModel)
  return depthColumns(input.viewModel, input.granularity, input.selectedNodeId)
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
 * 依存深度を列にする割り当て（ADR-001）。
 *
 * 起点は**未選択なら被依存数 0 のノード群、選択中ならそのノード 1 件**。
 * 被依存 0 のノードが複数あれば、そのすべてが同時に深度 0 の列へ並ぶ。
 *
 * 深度そのものの算出は IR（`core/ir/depth.ts`）に委ねる。**ここで BFS や
 * 被依存数を書き直さない。** 同じ絞り込みが散ると、たどりを IR に置いた意味が
 * 失われる。
 *
 * **深度は最短距離（BFS）で数える**（UT-02 の決定）。参照仕様の mockup は
 * 強連結成分を縮約した最長経路を使っており、そちらは「すべての矢印が前向きに
 * なる」代わりに深度の定義が ADR-001 の「起点からたどった距離」から離れる。
 * 代償として、深い列から浅い列へ戻る矢印が出る（後ろ向きの曲線は UT-06 が描ける）。
 *
 * **深度は `via: logical` で計算される**（`depth.ts`）。`actual` で依存を
 * たどる見方を入れる UT は、`computeDepths` / `findRootOrigins` に `via` を
 * 通すこと。ここで別のたどりを書かない。
 */
export function depthColumns(
  viewModel: ViewModel,
  granularity: Granularity,
  selectedNodeId: string | undefined,
): ColumnPlan {
  // 粒度に無いノードを起点にすると、全ノードが深度未定になって列が 1 本に潰れる。
  // 器（UT-05）は選択と粒度を揃えるが、ここは渡された値だけで閉じるようにする
  const origin = originInGranularity(viewModel, granularity, selectedNodeId)
  const origins = origin === undefined ? findRootOrigins(viewModel, granularity) : [origin]
  const depths = computeDepths(viewModel, granularity, origins)
  const selected = origin !== undefined

  return {
    columnOf: (node) => {
      const depth = depths.depthOf(node.id)
      return depth === DEPTH_UNDEFINED ? TRAILING_COLUMN : depth
    },
    headOf: (column) => {
      if (column === TRAILING_COLUMN) {
        // 起点からたどり着けないだけで、欠陥ではない（ADR-001 / N-1）
        return { label: '深度未定', colour: 'var(--color-ink-3)' }
      }
      if (column === 0) {
        return {
          label: selected ? '深度 0（選択中）' : '深度 0（起点）',
          colour: 'var(--color-ink-3)',
        }
      }
      return { label: `深度 ${column}`, colour: 'var(--color-ink-3)' }
    },
  }
}

function originInGranularity(
  viewModel: ViewModel,
  granularity: Granularity,
  nodeId: string | undefined,
): string | undefined {
  if (nodeId === undefined) return undefined
  const node = viewModel.nodeById.get(nodeId)
  if (node === undefined) return undefined
  return node.kind === granularity ? nodeId : undefined
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
