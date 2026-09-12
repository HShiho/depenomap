import { describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { buildSidebarList } from './sidebar-list'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

describe('一覧の組み立て（UT-12）', () => {
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

  it('被依存数が同じときの並びを、パスで固定する', () => {
    const list = buildSidebarList(viewModel, 'fan-in')

    const byCount = new Map<number, string[]>()
    for (const file of list) {
      const bucket = byCount.get(file.fanIn) ?? []
      bucket.push(file.node.path)
      byCount.set(file.fanIn, bucket)
    }

    // 同数のかたまりが実際にできていないと、この検査は何も見ていない
    const tied = [...byCount.values()].filter((paths) => paths.length > 1)
    expect(tied.length).toBeGreaterThan(0)

    // 正本 JSON の並びはパス順ではないので、固定していなければここで崩れる
    for (const paths of tied) expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)))
  })
})
