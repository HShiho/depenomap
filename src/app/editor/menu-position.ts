/**
 * 右クリックメニューを出す位置（UT-18）。
 *
 * 押した場所に出すのが基本だが、**画面の端で押されると外へはみ出す**。
 * はみ出した分は読めず、項目に届かない。収まる側へ寄せる。
 *
 * メニュー自体は移動しない（出したあとに動くと、押そうとした先がずれる）。
 * ここで決めるのは、出す瞬間の 1 点だけである。
 */

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** 画面の縁との間隔。縁に貼り付くと、角が切れて読みにくい */
const MARGIN = 8

/**
 * 押した場所から、メニューを出す位置を決める。
 *
 * @param point 押した場所（ビューポート座標）
 * @param menu メニューの大きさ。測る前（0）でも破綻しない
 * @param viewport 画面の大きさ
 */
export function menuPositionOf(point: Point, menu: Size, viewport: Size): Point {
  return {
    x: fit(point.x, menu.width, viewport.width),
    y: fit(point.y, menu.height, viewport.height),
  }
}

/**
 * 1 軸ぶんを収める。
 *
 * **縁に寄せるほうを優先する。** メニューが画面より大きいときは両端に収まらず、
 * どちらかがはみ出す。先頭側を残すほうが、少なくとも最初の項目には届く。
 */
function fit(at: number, size: number, limit: number): number {
  return Math.max(MARGIN, Math.min(at, limit - size - MARGIN))
}
