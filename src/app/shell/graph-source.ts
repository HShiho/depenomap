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
  try {
    await load(state, fetchImpl)
  } catch (cause) {
    /*
     * 投げたままにすると `status` が `loading` に固定され、画面は
     * 「読み込み中…」を出し続ける。理由はコンソールにしか残らない。
     * 想定外の失敗も状態へ落とし、画面が黙って止まらないようにする。
     */
    state.applyLoadOutcome({ kind: 'broken', message: (cause as Error).message })
  }
}

async function load(state: ViewState, fetchImpl?: typeof fetch): Promise<void> {
  /*
   * 前回の結果を落としてから始める。残すと、2 回目が失敗したときに
   * 「読み込めていないのに前回のグラフが見えている」状態ができる。
   */
  state.applyLoadOutcome({ kind: 'loading' })

  const outcome = await fetchGraph(fetchImpl)
  if (!outcome.reached) {
    state.applyLoadOutcome({ kind: 'unreachable', message: outcome.message })
    return
  }

  const result = outcome.result
  if (!result.ok) {
    // 表示の文言はここで決めない。素材はそのまま運び、見せ方は画面が決める
    state.applyLoadOutcome({ kind: 'invalid', errors: result.errors, warnings: result.warnings })
    return
  }

  state.applyLoadOutcome({
    kind: 'ready',
    viewModel: buildViewModel(result.graph),
    warnings: result.warnings,
  })
}
