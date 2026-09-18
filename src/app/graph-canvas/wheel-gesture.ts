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
  if (isZoomGesture(input)) {
    const factor = Math.exp(-input.deltaY * ZOOM_SENSITIVITY)
    return zoomAround(viewport, input.point, viewport.scale * factor)
  }

  /*
   * Shift を押しているあいだは、縦の回転量を横の移動に読み替える。
   * ホイールしか持たない環境で横へ動かす唯一の手段になる（スプレッドシートと同じ）。
   */
  if (input.shiftKey) return panBy(viewport, -input.deltaY, 0)

  return panBy(viewport, -input.deltaX, -input.deltaY)
}
