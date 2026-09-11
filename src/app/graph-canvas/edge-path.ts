/**
 * エッジの経路を組み立てる（UT-06）。
 *
 * **矢印は「使う側 → 使われる側」**を指す（US-01）。線の形は依存の良し悪しを
 * 表さない。層をまたぐ依存も、同じ層の中の依存も、同じ形で描く（N-1）。
 *
 * 直線ではなく 3 次ベジェにしてある。列をまたぐ依存が多い図では、直線だと
 * 途中のノードの下敷きになって始点と終点が追えなくなる。
 */

import { NODE_HEIGHT, NODE_WIDTH } from './layout'

/** 経路を引く対象の位置。`layout.ts` の結果をそのまま渡せる形 */
export interface EdgeEnd {
  x: number
  y: number
}

export interface EdgePathOptions {
  /** 自分自身への依存か。座標ではなくエッジの両端で決まる */
  selfLoop?: boolean
}

/** 同じ列とみなす横方向のずれ。手で動かした直後の微差を「別の列」にしない */
const SAME_COLUMN = 20

/** 前向き（左から右）の制御点の最小の張り出し */
const MIN_BOW_FORWARD = 46

/** 後ろ向き（右から左）の制御点の張り出し。回り込みを見せるため大きく取る */
const MIN_BOW_BACKWARD = 64

/** 列を大きく飛び越す線を上へ逃がす量の上限 */
const MAX_LIFT = 66

/** 自分自身への依存を描く輪の大きさ */
const LOOP_RADIUS = 18

function centreY(end: EdgeEnd): number {
  return end.y + NODE_HEIGHT / 2
}

/**
 * 使う側から使われる側への経路を返す（SVG の `d`）。
 *
 * 4 通りに分ける。**自己依存だけは座標ではなく呼び出し側の指定で決まる**
 * （`options.selfLoop`）。座標で見分けると、たまたま重なった別ノードへの依存を
 * 輪として描き、依存が 1 本消える。
 *
 * ```
 *     自己依存  ◯   右辺から出て、右辺へ戻る小さな輪（selfLoop で指定）
 *     前向き    ─▶  右辺から出て、左辺へ入る
 *     後ろ向き  ◀─  左辺から出て、右辺へ入る（外側へ回り込む）
 *     同じ列    ⤿   右辺から出て、右辺へ戻る
 * ```
 */
export function edgePath(from: EdgeEnd, to: EdgeEnd, options: EdgePathOptions = {}): string {
  /*
   * 自分自身への依存。座標で見分けると、たまたま重なった 2 ノードの依存まで
   * 片方の自己ループとして描き、依存が 1 本消える（手で動かせるようになる
   * UT-17 で実際に起こりうる）。呼び出し側はエッジを持っているので、
   * 同一性はそちらから渡してもらう
   */
  if (options.selfLoop) {
    const edgeX = from.x + NODE_WIDTH
    const top = centreY(from) - LOOP_RADIUS
    const bottom = centreY(from) + LOOP_RADIUS
    return `M${edgeX},${top} C${edgeX + LOOP_RADIUS * 2},${top} ${edgeX + LOOP_RADIUS * 2},${bottom} ${edgeX},${bottom}`
  }

  const fromY = centreY(from)
  const toY = centreY(to)

  if (to.x > from.x + SAME_COLUMN) {
    const startX = from.x + NODE_WIDTH
    const endX = to.x
    const bow = Math.max(MIN_BOW_FORWARD, (endX - startX) / 2)
    /*
     * 列を大きく飛び越す線は、少し上へ逃がす。隣の列へ入る線と同じ高さを
     * 通ると、どこから来た線なのかが読めなくなる
     */
    const lift = endX - startX > 320 ? -Math.min(MAX_LIFT, (endX - startX) / 8) : 0
    return `M${startX},${fromY} C${startX + bow},${fromY + lift} ${endX - bow},${toY + lift} ${endX},${toY}`
  }

  if (to.x < from.x - SAME_COLUMN) {
    const startX = from.x
    const endX = to.x + NODE_WIDTH
    const bow = Math.max(MIN_BOW_BACKWARD, (startX - endX) / 2 + 30)
    return `M${startX},${fromY} C${startX - bow},${fromY} ${endX + bow},${toY} ${endX},${toY}`
  }

  // 同じ列。右側へ膨らませて戻す。左へ出すと隣の列との線と重なる
  const startX = from.x + NODE_WIDTH
  const endX = to.x + NODE_WIDTH
  return `M${startX},${fromY} C${startX + 110},${fromY} ${endX + 110},${toY} ${endX},${toY}`
}
