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

/**
 * 見出し。メソッドは `owner.name`（例 `TodoController.post`）にする。
 * トップレベル関数は `owner` を持たないため名前だけ（スキーマ §3）。
 *
 * 長いときは**メソッド名を残して `owner` 側を削る**。先頭から一律に切ると、
 * 同じクラスの別メソッドが同じラベルになり、ノードを見分けられなくなる。
 *
 * メソッド名だけで上限を超える場合も、**所属があったことの印は残す**
 * （`….name`）。丸ごと落とすと、別のクラスの同名メソッドどうしが同じ見出しに
 * なるうえ、トップレベル関数とも区別がつかなくなる。
 */
export function titleOf(node: GraphNode): string {
  if (node.kind === 'file') return truncateName(node.name)
  if (node.owner === null) return truncateName(node.name)

  const full = `${node.owner}.${node.name}`
  if (full.length <= NAME_LIMIT) return full

  const room = NAME_LIMIT - node.name.length - 2
  if (room < 1) return `….${truncateName(node.name)}`
  return `${node.owner.slice(0, room)}….${node.name}`
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

function truncateName(value: string): string {
  return value.length > NAME_LIMIT ? `${value.slice(0, NAME_LIMIT - 1)}…` : value
}

/** パスは先頭を落とす。末尾（ファイルに近いほう）のほうが見分けに効く */
function truncatePath(value: string): string {
  return value.length > PATH_LIMIT ? `…${value.slice(value.length - PATH_LIMIT + 1)}` : value
}
