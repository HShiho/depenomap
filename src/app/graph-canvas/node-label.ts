/**
 * ノードに出す文字（UT-06 / UT-07）。
 *
 * 切り詰めの規則を描画から切り出してあるのは、**識別に効く側を残す**という
 * 判断が壊れていないことを、実データに無い長さでも検査できるようにするため。
 */

import type { GraphNode } from '@/core/graph/schema'
import { NODE_WIDTH } from './layout'

/** ノード内に入る識別子の長さ（参照仕様） */
export const NAME_LIMIT = 22

/** 同じく、2 行目のパス */
export const PATH_LIMIT = 24

/** 切り詰めても必ず残す `owner` の文字数。ここが 0 になると所属の手がかりが消える */
const OWNER_MIN = 1

/*
 * 見出しの右隣に印が出るとき（UT-10 の循環など）の幅の勘定。
 *
 * 印は同じ行の右端に置かれるので、**上限を据え置くと文字が重なって両方
 * 読めなくなる**。図は実寸を測れる場所ではない（SVG のテキストは描画後に
 * しか測れず、測ってから並べ直すと図が揺れる）ので、トークンの値から見積もる。
 */
/** 印の 1 文字ぶん。`--text-flag` は 9px で、出すのは全角の語だけ */
const FLAG_CHAR_WIDTH = 9
/** 見出しの 1 文字ぶん。`--text-ui` 12px の等幅は 0.6em 送り */
const NAME_CHAR_WIDTH = 7.2
/** 見出しの左端と、印の右端（描画側と同じ値） */
const NAME_X = 14
const FLAG_RIGHT = NODE_WIDTH - 10
/** 見出しと印のあいだに残す隙間 */
const FLAG_GAP = 8
/** 印があっても、見出しはこれ以下には縮めない */
const NAME_MIN = 8

/**
 * 印が並ぶときの見出しの上限。
 *
 * 印が無ければ据え置き（`NAME_LIMIT`）。印が長いほど見出しは短くなるが、
 * **見出しを潰し切らない** — 名前が消えると、どのノードなのかが読めなくなり、
 * 印だけが残る。全文は `tooltipOf` が持つ。
 */
export function nameLimitFor(flag: string | undefined): number {
  if (flag === undefined) return NAME_LIMIT

  const room = FLAG_RIGHT - flag.length * FLAG_CHAR_WIDTH - FLAG_GAP - NAME_X
  return Math.max(NAME_MIN, Math.min(NAME_LIMIT, Math.floor(room / NAME_CHAR_WIDTH)))
}

/**
 * 見出し。メソッドは `owner.name`（例 `TodoController.post`）にする。
 * トップレベル関数は `owner` を持たないため名前だけ（スキーマ §3）。
 *
 * 長いときは**メソッド名を残して `owner` 側を削る**。先頭から一律に切ると、
 * 同じクラスの別メソッドが同じラベルになり、ノードを見分けられなくなる。
 *
 * メソッド名だけで上限を超える場合も、`owner` を丸ごと落とさない。落とすと、
 * 別のクラスの同名メソッドどうしが同じ見出しになる（`ITodoRepository` と
 * `TodoRepository` の同名メソッドなど）うえ、トップレベル関数とも区別が
 * つかなくなる。`owner` を `OWNER_MIN` まで削ったうえで、メソッド名のほうも
 * 削って上限に収める。
 *
 * 上限が 22 文字である以上、これでも一意にはならない。全文は `tooltipOf` が持つ。
 *
 * 上限は呼ぶ側が縮められる。同じ行に印が出るときは、その幅ぶん狭くなる
 * （`nameLimitFor`）。
 */
export function titleOf(node: GraphNode, limit: number = NAME_LIMIT): string {
  if (node.kind === 'file') return truncate(node.name, limit)
  if (node.owner === null) return truncate(node.name, limit)

  const full = `${node.owner}.${node.name}`
  if (full.length <= limit) return full

  // `….` の 2 文字を差し引いた残りを、owner とメソッド名で分け合う
  const room = limit - node.name.length - 2
  if (room >= OWNER_MIN) return `${node.owner.slice(0, room)}….${node.name}`
  return `${node.owner.slice(0, OWNER_MIN)}….${truncate(node.name, limit - OWNER_MIN - 2)}`
}

/**
 * 2 行目。**メソッドは所属ファイルのパス**を出す（US-02）。
 * どのファイルの処理なのかが、ノード単体で分かる必要がある。
 */
export function subtitleOf(
  node: GraphNode,
  pathOfMethod: (id: string) => string | undefined,
): string {
  const path = node.kind === 'file' ? node.path : pathOfMethod(node.id)
  return truncatePath(path ?? '')
}

/**
 * ノードに重ねる説明（SVG の `<title>`）。**切り詰める前の全文**を持つ。
 *
 * 見出しは 22 文字、パスは 24 文字に収めるため、長い識別子は図の上では
 * 一意にならない。読み手が確かめる手段がどこにも無いと、同形のノードを
 * 見分けられない。
 *
 * 2 行にするのは、ノードの表示（識別子 / パス）と対応を取るため。改行を
 * 畳む描画系でも、続けて 1 行に読めるだけで情報は落ちない。
 */
export function tooltipOf(
  node: GraphNode,
  pathOfMethod: (id: string) => string | undefined,
): string {
  const name = fullTitleOf(node)
  const path = node.kind === 'file' ? node.path : pathOfMethod(node.id)
  return path === undefined || path === '' ? name : `${name}\n${path}`
}

/**
 * 切り詰める前の識別子。メソッドは `owner.name`、ファイルはその名前。
 *
 * ノードに重ねる説明（`tooltipOf`）と、絞り込みの印（UT-14）が同じ規則を使う。
 * 別々に組むと、同じノードが場所によって違う名前で出る。
 */
export function fullTitleOf(node: GraphNode): string {
  return node.kind === 'file' ? node.name : fullNameOf(node)
}

function fullNameOf(node: GraphNode & { kind: 'method' }): string {
  return node.owner === null ? node.name : `${node.owner}.${node.name}`
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

/** パスは先頭を落とす。末尾（ファイルに近いほう）のほうが見分けに効く */
function truncatePath(value: string): string {
  return value.length > PATH_LIMIT ? `…${value.slice(value.length - PATH_LIMIT + 1)}` : value
}
