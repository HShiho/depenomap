/**
 * 一覧の組み立て（UT-12）。
 *
 * ファイルを行にし、そこに属するメソッドをぶら下げる（US-09）。並べ替えの
 * 規則を描画から切り出してあるのは、**被依存数を数え直していない**ことと、
 * 同数のときの並びが揺れないことを、描画抜きで検査できるようにするため。
 *
 * **依存元／依存先の一覧はここに作らない**（N-4）。ノードマップを見れば分かる。
 */

import type { FileNode, MethodNode } from '@/core/graph/schema'
import type { ViewModel } from '@/core/ir/view-model'

/** 並べ替えの軸（US-10）。参照仕様の選択肢はこの 2 つだけ */
export type SidebarSort = 'path' | 'fan-in'

/** 一覧の 1 行ぶん。ファイルにもメソッドにも同じ形を使う */
export interface SidebarEntry<T extends FileNode | MethodNode> {
  node: T
  /** 被依存数。**UT-02 の算出結果をそのまま持つ**（ここで数え直さない） */
  fanIn: number
}

export interface SidebarFile extends SidebarEntry<FileNode> {
  methods: readonly SidebarEntry<MethodNode>[]
}

/**
 * 一覧を組む。
 *
 * **並べ替えは一覧全体に効く**。ファイル行を被依存数で並べたのに、開いた中の
 * メソッドがソース順のままだと、同じ一覧の中で 2 つの規則が混ざる。
 *
 * 同数のときの並びは固定する（パスと行番号）。揺れると、並べ替えを往復する
 * たびに行が入れ替わり、読み手が位置を見失う。
 */
export function buildSidebarList(viewModel: ViewModel, sort: SidebarSort): readonly SidebarFile[] {
  const files = viewModel.nodes.file.map((file) => ({
    node: file,
    fanIn: viewModel.fanInOf(file.id, 'file'),
    methods: sortMethods(
      (viewModel.methodsOfFile.get(file.id) ?? []).map((method) => ({
        node: method,
        fanIn: viewModel.fanInOf(method.id, 'method'),
      })),
      sort,
    ),
  }))

  return sort === 'path'
    ? files.sort((a, b) => a.node.path.localeCompare(b.node.path))
    : files.sort((a, b) => b.fanIn - a.fanIn || a.node.path.localeCompare(b.node.path))
}

function sortMethods(
  methods: SidebarEntry<MethodNode>[],
  sort: SidebarSort,
): readonly SidebarEntry<MethodNode>[] {
  return sort === 'path'
    ? methods.sort((a, b) => a.node.loc.line - b.node.loc.line)
    : methods.sort((a, b) => b.fanIn - a.fanIn || a.node.loc.line - b.node.loc.line)
}
