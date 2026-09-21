/**
 * ノードから「どこを開くか」を決める（UT-18 / US-19）。
 *
 * ノードが持つのは `meta.rootDir` からの相対パスで、**開く先のファイルと行**
 * はノードの種別で決まる。
 *
 * - ファイルノード — 自分の `path`。行は指定しない（この UT の決定）
 * - メソッドノード — **所属ファイルの `path`** と、自分の `loc`
 *
 * メソッドノードは `path` を持たない。所属ファイル（`parent`）を引かないと
 * 開く先が決まらないので、引き当ては呼び出し側から渡してもらう（描画抜きで
 * 検査できるようにするため）。
 *
 * `loc` は抽出側が 1-based に補正済みの値（スキーマ §3）。ここでは足さない。
 */

import type { FileNode, GraphNode } from '@/core/graph/schema'

/** 開く先。`meta.rootDir` からの相対パスと、行位置 */
export interface OpenTarget {
  /** `meta.rootDir` からの相対パス */
  path: string
  /** 行位置。ファイルノードでは持たない（先頭で開く） */
  loc?: { line: number; column: number }
}

/**
 * 開く先を決める。決められなければ `undefined`。
 *
 * **決められないことを欠陥として扱わない**（N-1）。メソッドの所属ファイルが
 * グラフに無いのは、正本 JSON がそう言っているだけで、ビューアが直せるもの
 * ではない。呼び出し側は、開く導線を出さない理由としてこれを使う。
 *
 * @param fileOf メソッド ID から所属ファイルノードを引く
 */
export function openTargetOf(
  node: GraphNode,
  fileOf: (methodId: string) => FileNode | undefined,
): OpenTarget | undefined {
  if (node.kind === 'file') return { path: node.path }

  const file = fileOf(node.id)
  if (file === undefined) return undefined

  return { path: file.path, loc: node.loc }
}
