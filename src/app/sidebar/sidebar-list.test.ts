import { describe, expect, it, vi } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { buildSidebarList, filterSidebarList } from './sidebar-list'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

describe('一覧の組み立て（UT-12）', () => {
  it('パス順では、被依存数の並びを作らない', () => {
    // IR はキャッシュを持たず、呼ぶたびに並べ替える。使わない並びは作らない
    const spy = vi.spyOn(viewModel, 'nodesByFanInDesc')
    try {
      buildSidebarList(viewModel, 'path')
      expect(spy).not.toHaveBeenCalled()

      buildSidebarList(viewModel, 'fan-in')
      expect(spy.mock.calls.map((call) => call[0]).sort()).toEqual(['file', 'method'])
    } finally {
      spy.mockRestore()
    }
  })

  it('層の色を 1 回だけ引く', () => {
    // 行ごとにテンプレートで引くと、選択が動くたびに全行ぶんの引き当てが走る
    const spy = vi.spyOn(viewModel, 'layerOf')
    try {
      const list = buildSidebarList(viewModel, 'path')

      expect(spy.mock.calls.length).toBe(viewModel.nodes.file.length)
      for (const file of list) {
        expect(file.colour).toMatch(/^var\(--color-(layer-\d|ink-3)\)$/)
      }
    } finally {
      spy.mockRestore()
    }
  })

  it('すべてのファイルが 1 行ずつ出る', () => {
    const list = buildSidebarList(viewModel, 'path')

    expect(list.map((file) => file.node.id)).toHaveLength(viewModel.nodes.file.length)
    expect(new Set(list.map((file) => file.node.id)).size).toBe(viewModel.nodes.file.length)
  })

  it('メソッドは所属ファイルにぶら下がる（US-09）', () => {
    const list = buildSidebarList(viewModel, 'path')
    const flattened = list.flatMap((file) => file.methods.map((method) => method.node))

    expect(flattened).toHaveLength(viewModel.nodes.method.length)
    for (const file of list) {
      for (const method of file.methods) expect(method.node.parent).toBe(file.node.id)
    }
  })

  it('被依存数は UT-02 の算出結果をそのまま持つ', () => {
    const list = buildSidebarList(viewModel, 'path')

    for (const file of list) {
      expect(file.fanIn).toBe(viewModel.fanInOf(file.node.id, 'file'))
      for (const method of file.methods) {
        expect(method.fanIn).toBe(viewModel.fanInOf(method.node.id, 'method'))
      }
    }
  })

  it('パス順では、ファイルがパスの順に並ぶ', () => {
    const paths = buildSidebarList(viewModel, 'path').map((file) => file.node.path)

    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)))
  })

  it('パス順では、メソッドがソース上の行の順に並ぶ', () => {
    const list = buildSidebarList(viewModel, 'path')
    const withMany = list.find((file) => file.methods.length > 2)!

    const lines = withMany.methods.map((method) => method.node.loc.line)
    expect(lines).toEqual([...lines].sort((a, b) => a - b))
  })

  it('被依存数の降順では、多い順に並ぶ（US-10）', () => {
    const list = buildSidebarList(viewModel, 'fan-in')
    const counts = list.map((file) => file.fanIn)

    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(counts[0]).toBeGreaterThan(counts.at(-1)!)
  })

  it('並べ替えは開いた中のメソッドにも効く', () => {
    // ファイルだけ並べ替えると、同じ一覧の中で 2 つの規則が混ざる
    const list = buildSidebarList(viewModel, 'fan-in')
    const withMany = list.find((file) => file.methods.length > 2)!

    const counts = withMany.methods.map((method) => method.fanIn)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('被依存数の降順は、IR が決めた並びをそのまま使う', () => {
    // 同数のときの規則を消費側が各々書くと、同数ノードの並びがばらつく（UT-02）
    const list = buildSidebarList(viewModel, 'fan-in')

    expect(list.map((file) => file.node.id)).toEqual(
      viewModel.nodesByFanInDesc('file').map((node) => node.id),
    )
  })

  it('開いた中のメソッドも、IR が決めた並びに従う', () => {
    const list = buildSidebarList(viewModel, 'fan-in')
    const withMany = list.find((file) => file.methods.length > 2)!
    const belongs = new Set(withMany.methods.map((method) => method.node.id))

    expect(withMany.methods.map((method) => method.node.id)).toEqual(
      viewModel
        .nodesByFanInDesc('method')
        .filter((node) => belongs.has(node.id))
        .map((node) => node.id),
    )
  })

  it('同数のかたまりが実際にできている（上の検査に歯を与える）', () => {
    const counts = buildSidebarList(viewModel, 'fan-in').map((file) => file.fanIn)

    expect(new Set(counts).size).toBeLessThan(counts.length)
  })
})

describe('検索で絞る（UT-11 / US-07）', () => {
  const all = buildSidebarList(viewModel, 'path')
  const filter = (query: string) => filterSidebarList(all, viewModel, query)

  it('空の検索語は絞り込まない', () => {
    // 検索欄が空なのは、まだ探していないのであって 0 件ではない
    expect(filter('')).toBe(all)
    expect(filter('   ')).toBe(all)
  })

  it('部分一致で残る。残る理由は自身か、中のメソッド（ADR-003）', () => {
    const kept = filter('Todo')

    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(all.length)
    for (const file of kept) {
      const self = `${file.node.name} ${file.node.path}`.toLowerCase()
      const viaMethod = file.methods.some((method) =>
        method.node.name.toLowerCase().includes('todo'),
      )
      expect(self.includes('todo') || viaMethod).toBe(true)
    }
  })

  it('大文字小文字を区別しない（ADR-003）', () => {
    expect(filter('todo').map((f) => f.node.id)).toEqual(filter('TODO').map((f) => f.node.id))
  })

  it('ディレクトリ名でも絞れる（同じ入力欄で）', () => {
    const kept = filter('src/domain/')

    expect(kept.length).toBeGreaterThan(0)
    for (const file of kept) expect(file.node.path).toContain('src/domain/')
  })

  it('メソッド名で当たると、そのファイルが当たったメソッドだけ連れて残る', () => {
    const method = viewModel.nodes.method.find((node) => node.name === 'execute')!
    const kept = filter(method.name)

    const owner = kept.find((file) => file.node.id === method.parent)!
    expect(owner).toBeDefined()
    expect(owner.match).toBeUndefined()
    for (const shown of owner.methods) expect(shown.node.name.toLowerCase()).toContain('execute')
  })

  it('ファイル自身が当たっても、並ぶメソッドは当たったものだけ', () => {
    /*
     * 中身を丸ごと残すと、自動で開いたときに当たった行と当たっていない行が
     * 同じ場所に並ぶ。メソッド行に当たった印は無いので、見分けられない
     */
    const target = all.find(
      (file) =>
        file.methods.length > 0 &&
        !file.methods.some((m) => m.node.name.includes(file.node.name.replace('.ts', ''))),
    )!
    const kept = filter(target.node.name)
    const found = kept.find((file) => file.node.id === target.node.id)!

    expect(found.match).toBe('name')
    expect(found.methods).toHaveLength(0)
  })

  it('パスにだけ当たった行は、そうと分かる', () => {
    // 名前を見ても、なぜ残っているのか読めない
    const kept = filter('src/infra/')
    const byPath = kept.filter((file) => file.match === 'path')

    expect(byPath.length).toBeGreaterThan(0)
    for (const file of byPath) expect(file.node.name.toLowerCase()).not.toContain('src/infra/')
  })

  it('当たらなければ 0 件。欠陥として扱わない（N-1）', () => {
    expect(filter('どこにも無い文字列')).toHaveLength(0)
  })
})

describe('当たったメソッドの印（UT-11）', () => {
  const all = buildSidebarList(viewModel, 'path')

  it('ファイル名が当たっても、中の当たったメソッドに印が残る', () => {
    // 残さないと、メソッドの見え方が所属ファイルの名前に左右される
    const kept = filterSidebarList(all, viewModel, 'todo')
    const byName = kept.filter((file) => file.match === 'name')
    const withHits = byName.filter((file) =>
      file.methods.some((method) => method.node.name.toLowerCase().includes('todo')),
    )

    expect(withHits.length).toBeGreaterThan(0)
    for (const file of withHits) {
      const marked = file.methods.filter((method) => method.match !== undefined)
      expect(marked.map((method) => method.node.name)).toEqual(
        file.methods
          .filter((method) => method.node.name.toLowerCase().includes('todo'))
          .map((method) => method.node.name),
      )
    }
  })

  it('ファイル名が当たっても、当たらなかったメソッドは並べない', () => {
    const kept = filterSidebarList(all, viewModel, 'todo')
    const named = kept.filter((file) => file.match === 'name')

    expect(named.length).toBeGreaterThan(0)
    for (const file of named) {
      for (const method of file.methods) expect(method.node.name.toLowerCase()).toContain('todo')
    }
  })

  it('メソッドの印はパスでは付かない', () => {
    /*
     * メソッドの検索キーのパスは所属ファイルのパスそのもの。パスに当たれば
     * ファイル行も必ず当たるので、中の行すべてで同じことを繰り返さない
     */
    const kept = filterSidebarList(all, viewModel, 'src/infra/')

    expect(kept.length).toBeGreaterThan(0)
    for (const file of kept) {
      expect(file.match).toBe('path')
      for (const method of file.methods) expect(method.match).toBeUndefined()
    }
  })
})
