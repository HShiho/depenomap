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

/** 3 次ベジェの 4 点。経路の文字列と中点は、どちらもここから作る */
export interface EdgeCurve {
  start: Point
  control1: Point
  control2: Point
  end: Point
}

interface Point {
  x: number
  y: number
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
  const { start, control1, control2, end } = edgeCurve(from, to, options)
  return `M${start.x},${start.y} C${control1.x},${control1.y} ${control2.x},${control2.y} ${end.x},${end.y}`
}

/**
 * 経路の**中点**。経由を示す印（UT-07）など、線の途中に何かを置くときに使う。
 *
 * 端点の中間ではなく曲線上の点を返す。曲線は大きく膨らむことがあり、
 * 端点の中間だと線から離れた場所に印が浮く。
 */
export function edgeMidpoint(from: EdgeEnd, to: EdgeEnd, options: EdgePathOptions = {}): Point {
  const { start, control1, control2, end } = edgeCurve(from, to, options)
  // 3 次ベジェの t = 0.5。各項の係数は 1/8, 3/8, 3/8, 1/8
  return {
    x: (start.x + 3 * control1.x + 3 * control2.x + end.x) / 8,
    y: (start.y + 3 * control1.y + 3 * control2.y + end.y) / 8,
  }
}

function edgeCurve(from: EdgeEnd, to: EdgeEnd, options: EdgePathOptions): EdgeCurve {
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
    return {
      start: { x: edgeX, y: top },
      control1: { x: edgeX + LOOP_RADIUS * 2, y: top },
      control2: { x: edgeX + LOOP_RADIUS * 2, y: bottom },
      end: { x: edgeX, y: bottom },
    }
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
    return {
      start: { x: startX, y: fromY },
      control1: { x: startX + bow, y: fromY + lift },
      control2: { x: endX - bow, y: toY + lift },
      end: { x: endX, y: toY },
    }
  }

  if (to.x < from.x - SAME_COLUMN) {
    const startX = from.x
    const endX = to.x + NODE_WIDTH
    const bow = Math.max(MIN_BOW_BACKWARD, (startX - endX) / 2 + 30)
    return {
      start: { x: startX, y: fromY },
      control1: { x: startX - bow, y: fromY },
      control2: { x: endX + bow, y: toY },
      end: { x: endX, y: toY },
    }
  }

  // 同じ列。右側へ膨らませて戻す。左へ出すと隣の列との線と重なる
  const startX = from.x + NODE_WIDTH
  const endX = to.x + NODE_WIDTH
  return {
    start: { x: startX, y: fromY },
    control1: { x: startX + 110, y: fromY },
    control2: { x: endX + 110, y: toY },
    end: { x: endX, y: toY },
  }
}
