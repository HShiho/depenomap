/**
 * 概要の集計（UT-13 / US-11）。
 *
 * 出すのは**事実の集計**だけで、違反件数・指摘・ルール別の内訳は持たない
 * （N-1）。層をまたぐ依存も「どれだけ流れているか」を数えるだけで、向きの
 * 正誤は判定しない。
 *
 * 表示側に代わってここで数えるのは、**誰が数えても同じ答えになるから**。
 * 概要パネルが自前で数えると、同じ値がサイドバー（被依存数）や図（層）と
 * 食い違いうる。
 */

import type { GraphEdge } from '../graph/schema'
import type { LayerKey } from './view-model'

/** 層から層への依存の流れ。同じ層の中は数えない（「またぐ」ものだけ） */
export interface LayerFlow {
  /** 呼ぶ側の層 */
  from: LayerKey
  /** 呼ばれる側の層 */
  to: LayerKey
  /**
   * 本数。
   *
   * **エッジの本数で数える**（被依存数がノード数で数えるのとは別）。ここで
   * 知りたいのは層のあいだにどれだけ依存が渡っているかで、同じ 2 ファイルを
   * つなぐ 2 本を 1 本に畳むと、その量が見えなくなる
   */
  count: number
}

/**
 * 層をまたぐ依存を数える。
 *
 * 層が未設定のノード（`NO_LAYER`）も 1 つの分類として数える。層が無いこと
 * 自体は欠陥ではない（ADR-002 / N-1）ので、落とすと本数の辻褄が合わなくなる。
 *
 * 並びは本数の降順。同数なら最初に現れた順（正本 JSON の並び）を保つ。
 */
export function buildLayerFlows(
  edges: readonly GraphEdge[],
  layerOf: (nodeId: string) => LayerKey,
): readonly LayerFlow[] {
  const flows = new Map<string, { flow: LayerFlow; index: number }>()

  for (const edge of edges) {
    const from = layerOf(edge.from)
    const to = layerOf(edge.to)
    if (from === to) continue

    const key = `${String(from)} ${String(to)}`
    const found = flows.get(key)
    if (found) found.flow.count += 1
    else flows.set(key, { flow: { from, to, count: 1 }, index: flows.size })
  }

  return [...flows.values()]
    .sort((a, b) => b.flow.count - a.flow.count || a.index - b.index)
    .map((entry) => entry.flow)
}

/**
 * 被依存を、使っている側の層ごとに数える。
 *
 * **数え方は `fanInOf` と揃える**（ノード数。同じ 2 ノード間に何本エッジが
 * あっても 1）。揃えないと、内訳の合計が被依存数と一致せず、同じ画面に
 * 食い違う 2 つの数が出る。
 */
export function buildFanInByLayer(
  edges: readonly GraphEdge[],
  layerOf: (nodeId: string) => LayerKey,
): ReadonlyMap<string, ReadonlyMap<LayerKey, number>> {
  const dependents = new Map<string, Set<string>>()
  for (const edge of edges) {
    const bucket = dependents.get(edge.to)
    if (bucket) bucket.add(edge.from)
    else dependents.set(edge.to, new Set([edge.from]))
  }

  const byLayer = new Map<string, Map<LayerKey, number>>()
  for (const [id, from] of dependents) {
    const counts = new Map<LayerKey, number>()
    for (const dependent of from) {
      const key = layerOf(dependent)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    byLayer.set(id, counts)
  }
  return byLayer
}
