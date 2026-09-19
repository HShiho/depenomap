/**
 * ノードを手で動かす計算（UT-17 / US-17）。
 *
 * 動かした位置は**表示上のもの**で、正本 JSON を書き換えない（C-3）。既定の
 * 並び（UT-08 の列レイアウト）に対する差分として持つ。
 *
 * ここは値の計算だけで、ポインタの購読も状態も持たない。押してから離すまでの
 * 判断（動かしたのか、押しただけなのか）を描画抜きで検査できるようにするため。
 */

import type { Point } from './viewport'

/**
 * 押しただけと見なす距離（画面 px）。
 *
 * **画面の距離で測る。** 図の座標で測ると、縮小しているほど小さな手の動きで
 * ドラッグと判定され、拡大しているほど動かしにくくなる。手の震えの大きさは
 * 倍率では変わらない。値は参照仕様（mockup）のもの。
 */
export const DRAG_THRESHOLD = 4

/**
 * 手で動かした位置。ノード ID から引く（UT-17 の公開する契約）。
 *
 * 既定の並びに対する差分であり、**これを持っているかどうかが「動かした状態」**。
 */
export type NodePositions = ReadonlyMap<string, Point>

/**
 * 押してから離すまでの記録。
 *
 * 掴んだ時点の位置を覚えるのは、移動のたびに足し込むと誤差が積み上がるため。
 * いつでも「掴んだ位置 + いまの差」で求め直す。
 */
export interface DragStart {
  nodeId: string
  /** 押した画面上の位置 */
  pointer: Point
  /** 掴んだ時点のノードの位置（図の座標） */
  origin: Point
}

/** 押しただけか、動かしたか。しきい値を超えたら動かしたと見なす */
export function isDrag(from: Point, to: Point): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD
}

/**
 * 動かした先の位置（図の座標）。
 *
 * **画面の移動量を倍率で割る。** 割らないと、拡大しているときにノードが
 * ポインタより速く動く。掴んだ場所がポインタの下から離れていく。
 */
export function draggedTo(start: DragStart, pointer: Point, scale: number): Point {
  return {
    x: start.origin.x + (pointer.x - start.pointer.x) / scale,
    y: start.origin.y + (pointer.y - start.pointer.y) / scale,
  }
}
