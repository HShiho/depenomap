/**
 * 層の見せ方（UT-04 / UT-06 / UT-08 / UT-12）。
 *
 * 層の並びと色は、ノードマップ（列の番号・ノードの色帯）と一覧（行の色帯）の
 * **両方が同じものを指す**。片方に置くともう片方が兄弟の内部を参照することに
 * なり、規則を変えたときに静かにずれる。器と同じ層（`shell/`）に 1 つ置く。
 */

import { NO_LAYER, type LayerKey, type ViewModel } from '@/core/ir/view-model'

/** 層カラーは 6 色を循環させる。層 ID には結び付けない（UT-04 の決定） */
const LAYER_COLOURS = 6

/**
 * 層の索引。**列の番号と色の番号は同じもの**（どちらも正本 JSON の `layers` の
 * 並び順 / ADR-002）なので、組み立てを 1 か所に置く。
 */
export function layerOrder(viewModel: ViewModel): ReadonlyMap<LayerKey, number> {
  return new Map<LayerKey, number>(viewModel.layerKeys.map((key, index) => [key, index]))
}

/** 層の色を引く口。**並べる軸に依らない**（列が深度になっても層は変わらない） */
export function layerColours(viewModel: ViewModel): (key: LayerKey | undefined) => string {
  const order = layerOrder(viewModel)
  return (key) => {
    if (key === undefined || key === NO_LAYER) return 'var(--color-ink-3)'
    const index = order.get(key) ?? 0
    return `var(--color-layer-${(index % LAYER_COLOURS) + 1})`
  }
}
