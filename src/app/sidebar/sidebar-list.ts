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
import { isActiveQuery, matchField } from '@/core/ir/search'
import type { Granularity, ViewModel } from '@/core/ir/view-model'
import { layerColours } from '../shell/layer-colour'

/** 並べ替えの軸（US-10）。参照仕様の選択肢はこの 2 つだけ */
export type SidebarSort = 'path' | 'fan-in'

/**
 * 検索語がどこに当たったか（UT-11）。
 *
 * 名前に当たっていない行は、名前を見ても**なぜ残っているのか分からない**。
 * 優劣を付けるためではなく、残っている理由を示すために持つ（N-1）。
 */
export type SidebarMatch = 'name' | 'path'

/** 一覧の 1 行ぶん。ファイルにもメソッドにも同じ形を使う */
export interface SidebarEntry<T extends FileNode | MethodNode> {
  node: T
  /** 被依存数。**UT-02 の算出結果をそのまま持つ**（ここで数え直さない） */
  fanIn: number
  /** 検索語に当たった場所。絞り込んでいないときは undefined */
  match?: SidebarMatch
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
   * 並びを作ることになる。
   *
   * **軸と土台を 1 つの値にする。** 別々に渡せる形だと、ファイル行は被依存数順・
   * メソッドはソース順という、R1-3 で直したはずの状態へ静かに戻れてしまう
   */
  const order: MethodOrder =
    sort === 'path' ? { axis: 'path' } : { axis: 'fan-in', rank: rankOf(viewModel, 'method') }
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
      order,
    ),
  }))

  if (sort === 'path') return files.sort((a, b) => a.node.path.localeCompare(b.node.path))

  const rank = rankOf(viewModel, 'file')
  return files.sort((a, b) => rank(a.node.id) - rank(b.node.id))
}

/** IR が決めた被依存数降順の並びを、ID から引ける形にする */
function rankOf(viewModel: ViewModel, granularity: Granularity): (nodeId: string) => number {
  const byRank = new Map(
    viewModel.nodesByFanInDesc(granularity).map((node, index) => [node.id, index]),
  )
  return (nodeId) => byRank.get(nodeId) ?? Number.MAX_SAFE_INTEGER
}

/** 開いた中のメソッドの並べ方。軸と、その軸に要る土台を対で持つ */
type MethodOrder = { axis: 'path' } | { axis: 'fan-in'; rank: (nodeId: string) => number }

function sortMethods(
  methods: SidebarEntry<MethodNode>[],
  order: MethodOrder,
): readonly SidebarEntry<MethodNode>[] {
  return order.axis === 'path'
    ? methods.sort((a, b) => a.node.loc.line - b.node.loc.line)
    : methods.sort((a, b) => order.rank(a.node.id) - order.rank(b.node.id))
}

/**
 * 検索語で一覧を絞る（UT-11 / US-07）。
 *
 * **絞り込みであって判定ではない**。一致しなかったノードを欠陥として扱わない
 * （N-1）。空の検索語は「絞り込まない」— 検索欄が空の状態は、まだ探していない
 * のであって 0 件ではない。
 *
 * ファイル行は**自身が一致したとき**と**中のメソッドが一致したとき**に残る。
 * 自身が一致したときは中のメソッドをすべて残す（そのファイルを探し当てたの
 * だから、開けば中身が見えてほしい）。メソッドだけが一致したときは、当たった
 * ものだけを並べる。
 *
 * 照合は IR の検索キー（ADR-003）に委ねる。**ここで対象や一致方式を書き直さ
 * ない** — 対象が散ると、同じ入力で違う結果が出る場所ができる。
 */
export function filterSidebarList(
  list: readonly SidebarFile[],
  viewModel: ViewModel,
  query: string,
): readonly SidebarFile[] {
  if (!isActiveQuery(query)) return list

  const kept: SidebarFile[] = []
  for (const file of list) {
    const fileMatch = matchOf(viewModel, file.node.id, query)
    const marked = file.methods.map((method) => ({
      ...method,
      match: nameMatchOf(viewModel, method.node.id, query),
    }))
    const hits = marked.filter((method) => method.match !== undefined)

    if (fileMatch !== undefined) kept.push({ ...file, match: fileMatch, methods: marked })
    else if (hits.length > 0) kept.push({ ...file, methods: hits })
  }
  return kept
}

/** 当たった場所。判定は IR に置く（対象と一致方式を書き直さない） */
function matchOf(viewModel: ViewModel, nodeId: string, query: string): SidebarMatch | undefined {
  const key = viewModel.searchKeyOf(nodeId)
  return key === undefined ? undefined : matchField(key, query)
}

/**
 * メソッドは**名前に当たったときだけ**印を持つ。
 *
 * メソッドの検索キーのパスは所属ファイルのパスそのもの（ADR-003）なので、
 * パスに当たればファイル行も必ず当たる。メソッド側にもパスの印を出すと、
 * ファイル行が既に示していることを中の行すべてで繰り返すことになる。
 */
function nameMatchOf(viewModel: ViewModel, nodeId: string, query: string): 'name' | undefined {
  return matchOf(viewModel, nodeId, query) === 'name' ? 'name' : undefined
}
