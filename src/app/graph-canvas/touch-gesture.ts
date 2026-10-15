/**
 * 指での操作（UT-22 / US-16・US-17 の受け皿）。
 *
 * キャンバスの上ではブラウザ既定のタッチ操作（ページのスクロール・拡大）を止め、
 * 次を自前で受ける（UT-22 の決定）。
 *
 *   - ノードの上の 1 本指: ノードを掴んで動かす（UT-17 の経路）
 *   - ノードの上で動かさずに長押し: そのノードのメニュー（UT-18）
 *   - ノード以外の 1 本指: 図のパン（UT-16 の移動と同じ結果）
 *   - 2 本指: ピンチで拡大縮小（UT-16 の倍率の上下限を守る）
 *
 * ここは**値の計算だけ**を持つ純粋関数で、イベントにも状態にも触れない。
 * マウス・トラックパッドの操作は、この UT では変えない。
 */

import { DRAG_THRESHOLD } from './node-drag'
import { panBy, zoomAround, type Point, type Viewport } from './viewport'

/**
 * 指で「動かした」とみなすしきい値（px）。**指はマウスよりぶれる**ので大きく取る。
 * 小さいと、ただタップしただけでノードが動き、選ぶつもりの操作が並べ替えになる
 */
export const TOUCH_DRAG_THRESHOLD = 8

/** 入力の種類ごとのしきい値。マウス・ペンは UT-17 のまま */
export function dragThresholdFor(pointerType: string): number {
  return pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD
}

/**
 * 長押しとみなすまでの時間（ms）。動かさずにこの時間押し続けたら、そのノードの
 * メニューを出す。iPhone / iPad の Safari は長押しで右クリックの合図
 * （`contextmenu`）を出さないので、自前で測る（UT-22 の決定）
 */
export const LONG_PRESS_MS = 500

/** 1 本指のパン。指が動いたぶん図も動く。倍率は変えない */
export function pan(viewport: Viewport, from: Point, to: Point): Viewport {
  return panBy(viewport, to.x - from.x, to.y - from.y)
}

const midpointOf = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distanceOf = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * 2 本指のピンチ。**指の間の広がりの比で拡大縮小し、2 本の指の中点にあったものを
 * 指の下に留める**（ホイールの拡大縮小がポインタの下を留めるのと同じ考え）。
 * 2 本がそろって動けば、そのぶん図も動く。倍率は UT-16 の上下限で止まる。
 *
 * 動かす前・動かしたあとのどちらかで指が同じ位置に重なっている（間の距離が 0）
 * ときは、倍率を変えずに動かすだけ。あとの距離が 0 で比を取ると、倍率が一気に
 * 最小まで落ちる
 */
export function pinch(
  viewport: Viewport,
  before: readonly [Point, Point],
  after: readonly [Point, Point],
): Viewport {
  const fromMid = midpointOf(before[0], before[1])
  const toMid = midpointOf(after[0], after[1])
  const fromDistance = distanceOf(before[0], before[1])
  const toDistance = distanceOf(after[0], after[1])
  // どちらかで指が重なっている（距離 0）なら、倍率は変えずに動かすだけ
  const ratio = fromDistance === 0 || toDistance === 0 ? 1 : toDistance / fromDistance

  const zoomed = zoomAround(viewport, fromMid, viewport.scale * ratio)
  return panBy(zoomed, toMid.x - fromMid.x, toMid.y - fromMid.y)
}
