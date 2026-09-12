/**
 * 一覧の組み立て（UT-12）。
 *
 * ファイルを行にし、そこに属するメソッドをぶら下げる（US-09）。並べ替えの
 * 規則を描画から切り出してあるのは、**被依存数を数え直していない**ことと、
 * 同数のときの並びが揺れないことを、描画抜きで検査できるようにするため。
 *
 * **依存元／依存先の一覧はここに作らない**（N-4）。ノードマップを見れば分かる。
 *
 * **仮想スクロールは入れない**（UT-12 の決定）。全ファイル行を DOM に置く。
 * 1 行あたりの要素数は少なく、開いていないファイルのメソッドは描かないため、
 * 実際に並ぶのは「ファイル数 + 開いたファイルのメソッド数」で収まる。行ごとの
 * 引き当てをここで済ませてあるので、選択が動いても一覧は作り直されない。
 * ノードマップ側で仮想化が要るようになったら（UT-06 の決定）、同じ判断で揃える。
 */

import type { FileNode, MethodNode } from '@/core/graph/schema'
import type { Granularity, ViewModel } from '@/core/ir/view-model'
import { layerColours } from '../shell/layer-colour'

/** 並べ替えの軸（US-10）。参照仕様の選択肢はこの 2 つだけ */
export type SidebarSort = 'path' | 'fan-in'

/** 一覧の 1 行ぶん。ファイルにもメソッドにも同じ形を使う */
export interface SidebarEntry<T extends FileNode | MethodNode> {
  node: T
  /** 被依存数。**UT-02 の算出結果をそのまま持つ**（ここで数え直さない） */
  fanIn: number
}

export interface SidebarFile extends SidebarEntry<FileNode> {
  /** 層の色。**ここで 1 回引く** — 行ごとにテンプレートで引くと、選択が動く
   * たびに全行ぶんの引き当てとオブジェクト生成が走る */
  colour: string
  methods: readonly SidebarEntry<MethodNode>[]
}

/**
 * 一覧を組む。
 *
 * **並べ替えは一覧全体に効く**。ファイル行を被依存数で並べたのに、開いた中の
 * メソッドがソース順のままだと、同じ一覧の中で 2 つの規則が混ざる。
 *
 * 被依存数の降順は **IR の `nodesByFanInDesc` の並びをそのまま使う**。同数の
 * ときの規則（正本 JSON の並びを保つ）は誰が書いても同じ答えになるもので、
 * 消費側が各々書くと同数ノードの並びがばらつく、と UT-02 が決めている。
 */
export function buildSidebarList(viewModel: ViewModel, sort: SidebarSort): readonly SidebarFile[] {
  /*
   * 並びの土台は、使う軸のぶんだけ作る。IR の被依存数降順は呼ぶたびに
   * 並べ替えており（キャッシュを持たない）、既定のパス順では一度も使わない
   * 並びを作ることになる
   */
  const methodRank = sort === 'fan-in' ? rankOf(viewModel, 'method') : undefined
  const colourOf = layerColours(viewModel)
  const files = viewModel.nodes.file.map((file) => ({
    node: file,
    fanIn: viewModel.fanInOf(file.id, 'file'),
    colour: colourOf(viewModel.layerOf(file.id).key),
    methods: sortMethods(
      (viewModel.methodsOfFile.get(file.id) ?? []).map((method) => ({
        node: method,
        fanIn: viewModel.fanInOf(method.id, 'method'),
      })),
      sort,
      methodRank,
    ),
  }))

  if (sort === 'path') return files.sort((a, b) => a.node.path.localeCompare(b.node.path))

  const rank = rankOf(viewModel, 'file')
  return files.sort((a, b) => rank(a.node.id) - rank(b.node.id))
}

/** IR が決めた被依存数降順の並びを、ID から引ける形にする */
function rankOf(viewModel: ViewModel, granularity: Granularity): (nodeId: string) => number {
  const order = new Map(
    viewModel.nodesByFanInDesc(granularity).map((node, index) => [node.id, index]),
  )
  return (nodeId) => order.get(nodeId) ?? Number.MAX_SAFE_INTEGER
}

function sortMethods(
  methods: SidebarEntry<MethodNode>[],
  sort: SidebarSort,
  rank: ((nodeId: string) => number) | undefined,
): readonly SidebarEntry<MethodNode>[] {
  return sort === 'path' || rank === undefined
    ? methods.sort((a, b) => a.node.loc.line - b.node.loc.line)
    : methods.sort((a, b) => rank(a.node.id) - rank(b.node.id))
}
