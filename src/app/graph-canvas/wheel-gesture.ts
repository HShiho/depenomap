/**
 * ホイール／トラックパッドの割り当て（UT-16 / US-16）。
 *
 * 操作感は**スプレッドシートに寄せる**（完了条件）。普段使っている操作と
 * 同じなら、覚え直さずに済む。
 *
 * ```
 *     2 本指スクロール          → 縦横に動かす
 *     Shift + スクロール        → 横に動かす
 *     ピンチ / ⌘・Ctrl + ホイール → ポインタ位置を基準に拡大縮小
 * ```
 *
 * **ピンチは `ctrlKey` の付いたホイールとして届く。** ブラウザはトラックパッドの
 * ピンチを「Ctrl を押しながらのホイール」に変換するので、修飾キーでの拡大縮小と
 * 同じ経路になる。押していないキーを推測しているわけではない。
 *
 * ここは**値の計算だけ**で、`preventDefault` も状態の更新も持たない。どの入力が
 * どの動きになるかを、描画抜きで検査できるようにするため。
 */

import { panBy, zoomAround, type Point, type Viewport } from './viewport'

/** ホイールから読む値。`WheelEvent` の部分集合 */
export interface WheelInput {
  deltaX: number
  deltaY: number
  /**
   * 量の単位（`WheelEvent.deltaMode`）。0 が px、1 が行、2 がページ。
   *
   * **px とは限らない。** Firefox + 物理ホイールは行単位（`deltaY = ±3`）で
   * 送ってくる。px として扱うと 1 ノッチが 3px になり、実質動かない
   */
  deltaMode?: number
  shiftKey: boolean
  /** ピンチもここに立つ（ブラウザがそう変換する） */
  ctrlKey: boolean
  metaKey: boolean
  /** キャンバスの左上から測ったポインタの位置 */
  point: Point
}

/**
 * 拡大縮小の効き。`deltaY` を指数に通すので、大きく回しても倍率が反転しない。
 * 値は参照仕様（mockup）のもの。
 */
const ZOOM_SENSITIVITY = 0.0022

/**
 * 単位ごとの px 換算。
 *
 * 行の高さも画面の高さも環境で変わるが、**ここで実測しない** — 測るには
 * 描画を触ることになり、この層が持てる情報ではない。行はノードの 1 行ぶん、
 * ページは画面 1 枚ぶんとして、桁を合わせるだけの目安を置く。
 */
const LINE_HEIGHT = 16
const PAGE_HEIGHT = 800

function toPixels(amount: number, mode: number | undefined): number {
  if (mode === 1) return amount * LINE_HEIGHT
  if (mode === 2) return amount * PAGE_HEIGHT
  return amount
}

/** この入力が拡大縮小か。偽なら移動 */
export function isZoomGesture(input: Pick<WheelInput, 'ctrlKey' | 'metaKey'>): boolean {
  return input.ctrlKey || input.metaKey
}

/**
 * ホイール 1 回ぶんを当てたあとのビューポート。
 *
 * **移動は入力の符号を反転する。** 下へスクロールすると図は上へ動く、という
 * スクロールの向きに合わせる（図を動かすのではなく、図の上を移動している）。
 */
export function applyWheel(viewport: Viewport, input: WheelInput): Viewport {
  const dx = toPixels(input.deltaX, input.deltaMode)
  const dy = toPixels(input.deltaY, input.deltaMode)

  if (isZoomGesture(input)) {
    const factor = Math.exp(-dy * ZOOM_SENSITIVITY)
    return zoomAround(viewport, input.point, viewport.scale * factor)
  }

  /*
   * Shift を押しているあいだは横へ動かす。ホイールしか持たない環境で横へ
   * 動かす唯一の手段になる（スプレッドシートと同じ）。
   *
   * **縦と横のどちらで届くかは環境で変わる。** ブラウザによっては Shift +
   * ホイールを自分で横（`deltaX`）へ振り替えて送ってくるので、縦だけを見ると
   * その環境で動かなくなる。両方を足して 1 つの横移動にする
   */
  if (input.shiftKey) return panBy(viewport, -(dx + dy), 0)

  return panBy(viewport, -dx, -dy)
}
