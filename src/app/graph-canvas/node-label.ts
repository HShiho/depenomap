/**
 * ノードに出す文字（UT-06 / UT-07）。
 *
 * 切り詰めの規則を描画から切り出してあるのは、**識別に効く側を残す**という
 * 判断が壊れていないことを、実データに無い長さでも検査できるようにするため。
 */

import type { GraphNode } from '@/core/graph/schema'

/** ノード内に入る識別子の長さ（参照仕様） */
export const NAME_LIMIT = 22

/** 同じく、2 行目のパス */
export const PATH_LIMIT = 24

/** 切り詰めても必ず残す `owner` の文字数。ここが 0 になると所属の手がかりが消える */
const OWNER_MIN = 1

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
 */
export function titleOf(node: GraphNode): string {
  if (node.kind === 'file') return truncate(node.name, NAME_LIMIT)
  if (node.owner === null) return truncate(node.name, NAME_LIMIT)

  const full = `${node.owner}.${node.name}`
  if (full.length <= NAME_LIMIT) return full

  // `….` の 2 文字を差し引いた残りを、owner とメソッド名で分け合う
  const room = NAME_LIMIT - node.name.length - 2
  if (room >= OWNER_MIN) return `${node.owner.slice(0, room)}….${node.name}`
  return `${node.owner.slice(0, OWNER_MIN)}….${truncate(node.name, NAME_LIMIT - OWNER_MIN - 2)}`
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
  const name = node.kind === 'file' ? node.name : fullNameOf(node)
  const path = node.kind === 'file' ? node.path : pathOfMethod(node.id)
  return path === undefined || path === '' ? name : `${name}\n${path}`
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
