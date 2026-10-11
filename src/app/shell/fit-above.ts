/**
 * 下端から上へ開く板を、キャンバスの上端までに収める（UT-32）。
 *
 * 凡例（UT-26）と「表示」（UT-31）の板は、下端の帯の上へ開く。帯の高さは
 * ツールバーが何段に折り返したかで変わり、窓が低いと板の上端がキャンバスの外へ
 * 出て切れる。CSS だけでは折り返した段数が分からないので、**開いたときと、
 * キャンバスの大きさが変わったときに測る**。収まらない分は板の中を縦に
 * スクロールさせる（使う側が `overflow-y: auto` を付ける）。
 *
 * 板は下端を基準に置いてあるので、上限を変えても下端は動かない。測り直しても
 * 結果が揺れない。
 */

import { nextTick, ref, watch, type Ref } from 'vue'

import { useViewState } from './view-state'

/**
 * キャンバスの領域を示す属性。`AppShell` のキャンバスに付ける。
 * scoped CSS の class 名に頼らず、ここで名前を 1 つに決める
 */
export const CANVAS_BOUNDS_ATTRIBUTE = 'data-canvas-bounds'

/** 板の下端から、上の限界までの距離。限界を越えていれば 0 */
export function availableAbove(boardBottom: number, limitTop: number): number {
  return Math.max(0, boardBottom - limitTop)
}

/**
 * 板の高さの上限（`max-height` に渡す値）。閉じているあいだは `undefined`。
 *
 * 上の限界は、キャンバスの上端から重ねる要素の余白（`--overlay-inset`）だけ
 * 下げた位置。左上の断りのチップと同じ余白を空ける。
 */
export function useFitAbove(
  board: Readonly<Ref<HTMLElement | null>>,
  active: () => boolean,
): Ref<string | undefined> {
  const state = useViewState()
  const maxHeight = ref<string | undefined>()

  function measure(): void {
    const element = board.value
    if (element === null || !active()) {
      maxHeight.value = undefined
      return
    }
    const canvas = element.closest(`[${CANVAS_BOUNDS_ATTRIBUTE}]`)
    if (canvas === null) return

    const inset = parseFloat(getComputedStyle(canvas).getPropertyValue('--overlay-inset')) || 0
    const limitTop = canvas.getBoundingClientRect().top + inset
    maxHeight.value = `${availableAbove(element.getBoundingClientRect().bottom, limitTop)}px`
  }

  /*
   * 描き終わってから測る。開いた直後は、板がまだ置かれていない。
   *
   * **`flush: 'post'` だけでは足りない。** `v-show` の表示の切り替えも描画後の処理で、
   * 監視のほうが先に走ると、隠れたまま（位置 0）を測って上限が 0 に潰れる。
   * もう 1 拍待って、後処理がすべて済んでから測る
   */
  watch([active, () => state.canvasWidth, () => state.canvasHeight], () => void nextTick(measure), {
    flush: 'post',
  })

  return maxHeight
}
