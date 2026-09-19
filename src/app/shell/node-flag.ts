/**
 * ノードの右上に出す印（UT-10 の循環、UT-19 の追跡できなかった依存）。
 *
 * 置き場が 1 つしかない（名前と同じ行の右端）ので、**組み立てる場所も 1 つに
 * する**。別々に足すと、両方が当たるノードで印どうしが重なる。
 *
 * どちらも**事実の提示であって判定ではない**（N-1）。循環していること、
 * 追跡できなかった呼び出しがあることを、それぞれ欠陥として扱わない。
 */

import type { ViewModel } from '@/core/ir/view-model'
import { cycleMarkOf } from './cycle-mark'

/** 追跡できなかった依存の印。件数まで出す（どれかは一覧で見る / UT-19） */
function unresolvedMarkOf(viewModel: ViewModel, nodeId: string): string | undefined {
  const count = viewModel.unresolvedFrom(nodeId).length
  return count === 0 ? undefined : `未追跡 ${count}`
}

/**
 * ノードに出す印。無ければ `undefined`。
 *
 * 両方あるときは中黒でつなぐ。**片方を落とさない** — どちらも正本 JSON が
 * 言っている事実で、画面の都合で消すと読み手に届かなくなる。
 */
export function nodeFlagOf(viewModel: ViewModel, nodeId: string): string | undefined {
  const marks = [cycleMarkOf(viewModel, nodeId), unresolvedMarkOf(viewModel, nodeId)].filter(
    (mark): mark is string => mark !== undefined,
  )

  return marks.length === 0 ? undefined : marks.join('・')
}
