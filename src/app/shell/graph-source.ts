/**
 * グラフを取りに行き、表示状態の器へ載せる（UT-05）。
 *
 * 取得の口は UT-03（`core/graph/api`）、表示用への変換は UT-02
 * （`buildViewModel`）が持つ。ここが足すのは**結果を状態へ写す**ところだけで、
 * 判定も変換もしない。画面側は状態を読むだけになる。
 */

import { fetchGraph } from '@/core/graph/api'
import { buildViewModel } from '@/core/ir/view-model'
import type { useViewState } from './view-state'

type ViewState = ReturnType<typeof useViewState>

/**
 * グラフを読み込んで状態へ載せる。
 *
 * 「サーバーに届かなかった」と「正本 JSON を読めなかった」を分けたまま運ぶ。
 * 前者は起動の問題、後者は正本の問題であり、利用者に直させる場所が違う。
 *
 * **警告は成否によらず載せる。** 読み込みに失敗した場合も、そこまでに
 * 集まった警告は返ってきており、正本を直す側にとっては同時に見えたほうが速い。
 */
export async function loadGraphInto(state: ViewState, fetchImpl?: typeof fetch): Promise<void> {
  state.status = { kind: 'loading' }

  const outcome = await fetchGraph(fetchImpl)
  if (!outcome.reached) {
    state.status = { kind: 'unreachable', message: outcome.message }
    return
  }

  const result = outcome.result
  state.warnings = result.warnings

  if (!result.ok) {
    // 表示の文言はここで決めない。種別だけを運び、見せ方は画面が決める
    state.errors = result.errors.map((error) => error.type)
    state.status = { kind: 'invalid' }
    return
  }

  state.errors = []
  state.viewModel = buildViewModel(result.graph)
  state.status = { kind: 'ready' }
}
