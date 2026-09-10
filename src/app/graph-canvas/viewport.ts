/**
 * ビューポート（UT-06 が公開する契約のひとつ）。
 *
 * 図の座標（world）と画面の座標（screen）の対応を 1 か所に持つ。平行移動と
 * 拡大縮小は SVG の `viewBox` ではなく**ルートの `<g transform>`** で表す。
 * UT-16（トラックパッド操作）と UT-17（手で動かす）はドラッグ中に毎フレーム
 * 更新するため、4 値を組み替える `viewBox` より変換式が 1 本で済むほうがよい。
 *
 * ```
 *     screen = world * scale + offset
 *     world  = (screen - offset) / scale
 * ```
 *
 * ここは**値の計算だけ**を持つ純粋関数の集まりで、状態は持たない。
 */

import { NODE_HEIGHT, NODE_WIDTH } from './layout'

export interface Viewport {
  /** 画面上のずれ（px） */
  x: number
  y: number
  /** 倍率。1 が等倍 */
  scale: number
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** 拡大縮小の範囲。外れると図として読めなくなる */
export const MIN_SCALE = 0.2
export const MAX_SCALE = 2.5

/** 全体表示のときに図の周りへ残す余白（px） */
const FIT_MARGIN = 32

export const IDENTITY: Viewport = { x: 0, y: 0, scale: 1 }

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function toScreen(viewport: Viewport, point: Point): Point {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  }
}

export function toWorld(viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  }
}

/** `<g>` に載せる変換。読み順（先に移動、次に拡大）がそのまま式と一致する */
export function transformOf(viewport: Viewport): string {
  return `translate(${viewport.x},${viewport.y}) scale(${viewport.scale})`
}

/**
 * 図の全体が入るビューポートを求める。
 *
 * 図が画面より小さいときは**拡大しない**。1 を超えて広げると、ノード 2 つの
 * 図が画面いっぱいに引き伸ばされて、かえって読みにくくなる。
 */
export function fit(content: Size, view: Size): Viewport {
  if (content.width <= 0 || content.height <= 0 || view.width <= 0 || view.height <= 0) {
    return IDENTITY
  }

  /*
   * 余白を引いた結果が 0 以下になる（画面が余白より狭い）ときは、余白なしで
   * 収める。負の幅で割ると倍率が負になり、下限へ丸められた結果として
   * 「収める」はずの計算が画面外を指す
   */
  const usable = {
    width: Math.max(1, view.width - FIT_MARGIN * 2),
    height: Math.max(1, view.height - FIT_MARGIN * 2),
  }
  const scale = clampScale(
    Math.min(1, usable.width / content.width, usable.height / content.height),
  )

  /*
   * 収まるときは中央へ。収まりきらないとき（下限の倍率でも画面より大きい）は
   * 左上を起点にする。中央寄せの式をそのまま使うと負の座標になり、図の左上が
   * 画面の外に出て「収める」計算が収まらない位置を返す
   */
  return {
    scale,
    x: Math.max(0, (view.width - content.width * scale) / 2),
    y: Math.max(0, (view.height - content.height * scale) / 2),
  }
}

/**
 * 画面上のある点を動かさずに拡大縮小する。
 *
 * ポインタの下にあるものが動かないのが、拡大縮小の自然な振る舞い。倍率だけを
 * 変えると図が画面の左上へ寄っていく。
 */
export function zoomAround(viewport: Viewport, anchor: Point, nextScale: number): Viewport {
  const scale = clampScale(nextScale)
  const world = toWorld(viewport, anchor)
  return {
    scale,
    x: anchor.x - world.x * scale,
    y: anchor.y - world.y * scale,
  }
}

/** 画面のぶんだけ動かす（トラックパッドのスクロール、ドラッグ） */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy }
}

/**
 * ノードが画面の中央に来るように動かす。倍率は変えない。
 *
 * 検索（UT-11）や依存のたどり（UT-14）から「そのノードへ行く」ときに使う。
 * 倍率まで変えると、行き先を見るたびに図の縮尺が変わって位置感覚が崩れる。
 */
export function centreOn(viewport: Viewport, node: Point, view: Size): Viewport {
  const centre = {
    x: node.x + NODE_WIDTH / 2,
    y: node.y + NODE_HEIGHT / 2,
  }
  return {
    ...viewport,
    x: view.width / 2 - centre.x * viewport.scale,
    y: view.height / 2 - centre.y * viewport.scale,
  }
}
