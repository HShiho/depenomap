/**
 * 循環の印（UT-10 / US-06）。
 *
 * 循環は依存の形として特筆すべき事実であり、見落としたくない。ただし出すのは
 * **そこに循環という形がある**という事実だけで、ルールに反しているという
 * 意味づけも、直すべきという示唆も伴わない（N-1）。深刻度に相当する概念は
 * 持たない（スキーマ §3）。
 *
 * **検出はしない。** JSON の `cycles` をそのまま読む（スキーマ §4）。
 *
 * 文言を組み立てる場所をここ 1 つにしてある。図と一覧が別々に組み立てると、
 * 同じノードが片方では「型のみ」、もう片方では何も添えないことが起こりうる。
 *
 * **置き場が `shell` なのは、図と一覧の両方が使うから。** どちらかの機能の中に
 * 置くと、もう一方が隣の機能へ手を伸ばすことになる（`layer-colour` と同じ）。
 */

import { typeOnlyStateOf } from '@/core/ir/indices'
import type { ViewModel } from '@/core/ir/view-model'

/**
 * 型のみであることを添えた印。
 *
 * 凡例（UT-26）もこの語を引く。直書きすると、図と凡例で別のことを言いうる。
 */
export const TYPE_ONLY_LABEL = '循環（型のみ）'
/**
 * 添えない印。型のみかどうかを言わない。
 *
 * 幅の狭い場所（一覧の行）はこちらだけを出すので、公開している。
 * そちらで直書きすると、同じ行の中で表示と説明が食い違いうる。
 */
export const CYCLE_LABEL = '循環'

/**
 * ノードに出す印。循環に含まれなければ `undefined`。
 *
 * **`typeOnly` を添えるのは、属するすべての循環が型のみのときだけ。** 1 つでも
 * 型のみでない循環・`typeOnly` を持たない循環（メソッド粒度）が混じれば添えない。
 * 添えないことは「型のみではない」という判定ではない。正本 JSON がそう言って
 * いない以上、こちらから言い切らない（N-1）。
 *
 * **複数の循環に属していても印は 1 つ。** 件数を出すと「多いほど悪い」という
 * 読み方を持ち込むことになる（N-1）。どの循環なのかは、循環を選んでたどる
 * 手段（UT-14）で追える。
 */
export function cycleMarkOf(viewModel: ViewModel, nodeId: string): string | undefined {
  const cycles = viewModel.cyclesOf(nodeId)
  if (cycles.length === 0) return undefined

  return cycles.every((cycle) => typeOnlyStateOf(cycle) === 'type-only')
    ? TYPE_ONLY_LABEL
    : CYCLE_LABEL
}

/** エッジが循環に含まれるか。線の描き分けに使う */
export function isCycleEdge(viewModel: ViewModel, edgeId: string): boolean {
  return viewModel.cyclesOfEdge(edgeId).length > 0
}
