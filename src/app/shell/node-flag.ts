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

/** 追跡できなかった依存がある、という印 */
const UNRESOLVED = '未追跡'

/**
 * 追跡できなかった依存の印。
 *
 * **件数は出さない**（循環の印と同じ扱い / N-1）。数を出すと「多いほど悪い」と
 * いう読み方を持ち込む。どれが追えていないのかは一覧で見る。
 *
 * **ファイル粒度では、中のメソッドのぶんも数える。** `unresolved[].from` は必ず
 * メソッド（スキーマ §3 / 読み込み時に検査済み）なので、そのままだと既定の
 * 表示では一度も出ない。ファイルを見ているときも「この先が追えていない」ことは
 * 知りたい。
 */
function unresolvedMarkOf(viewModel: ViewModel, nodeId: string): string | undefined {
  if (viewModel.unresolvedFrom(nodeId).length > 0) return UNRESOLVED

  const node = viewModel.nodeById.get(nodeId)
  if (node?.kind !== 'file') return undefined

  const methods = viewModel.methodsOfFile.get(node.id) ?? []
  return methods.some((method) => viewModel.unresolvedFrom(method.id).length > 0)
    ? UNRESOLVED
    : undefined
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
