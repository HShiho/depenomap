import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '../graph/schema'
import { buildViewModel, NO_LAYER } from './view-model'

const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)
const fixture: unknown = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'))

function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}
const vmOf = (mutate?: (g: DependencyGraph) => void) => buildViewModel(graphOf(mutate))

describe('このグラフの素性（US-11）', () => {
  it('正本 JSON の meta をそのまま持つ', () => {
    // 書式を整えるのは読ませ方の判断で、IR の仕事ではない
    expect(vmOf().meta).toEqual(graphOf().meta)
  })
})

describe('層をまたぐ依存の流れ（US-11）', () => {
  it('層をまたぐ依存を、層の組ごとに数える', () => {
    const vm = vmOf()
    const flows = vm.layerFlows('file')

    const counted = new Map(flows.map((flow) => [`${String(flow.from)} ${String(flow.to)}`, flow]))
    for (const edge of vm.edges.file) {
      const from = vm.layerOf(edge.from).key
      const to = vm.layerOf(edge.to).key
      if (from === to) continue
      expect(counted.get(`${String(from)} ${String(to)}`)?.count).toBeGreaterThan(0)
    }
    expect(flows.reduce((sum, flow) => sum + flow.count, 0)).toBe(
      vm.edges.file.filter((edge) => vm.layerOf(edge.from).key !== vm.layerOf(edge.to).key).length,
    )
  })

  it('同じ層の中は数えない', () => {
    const flows = vmOf().layerFlows('file')

    expect(flows.every((flow) => flow.from !== flow.to)).toBe(true)
  })

  it('本数で数える。同じ 2 ノード間の複数エッジを畳まない', () => {
    // 層のあいだに渡っている依存の量が知りたい。畳むとその量が見えなくなる
    const base = vmOf().layerFlows('file')
    const doubled = vmOf((g) => {
      const across = g.edges.find((edge) => {
        if (edge.granularity !== 'file') return false
        const from = g.nodes.find((n) => n.id === edge.from)?.layer
        const to = g.nodes.find((n) => n.id === edge.to)?.layer
        return from !== to
      })!
      g.edges.push({ ...across, id: `${across.id}:dup` })
    }).layerFlows('file')

    expect(doubled.reduce((sum, flow) => sum + flow.count, 0)).toBe(
      base.reduce((sum, flow) => sum + flow.count, 0) + 1,
    )
  })

  it('本数の降順に並ぶ', () => {
    const counts = vmOf()
      .layerFlows('file')
      .map((flow) => flow.count)

    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('層が未設定のノードも 1 つの分類として数える', () => {
    // 層が無いこと自体は欠陥ではない（ADR-002 / N-1）。落とすと辻褄が合わなくなる
    const vm = vmOf((g) => {
      for (const node of g.nodes) if (node.kind === 'file') delete node.layer
      // 1 件だけ層を残し、またぐ依存を作る
      const layered = g.nodes.find((n) => n.kind === 'file')!
      layered.layer = g.layers[0]!.id
    })
    const flows = vm.layerFlows('file')

    expect(flows.length).toBeGreaterThan(0)
    expect(flows.some((flow) => flow.from === NO_LAYER || flow.to === NO_LAYER)).toBe(true)
  })

  it('メソッド粒度でも数えられる', () => {
    expect(vmOf().layerFlows('method').length).toBeGreaterThan(0)
  })

  it('層 ID に区切り文字が入っていても、別の組と混ざらない', () => {
    // 層 ID の書式は正本 JSON の自由。ビューアはその中身を検査しない（N-1）
    const vm = vmOf((g) => {
      g.layers = [
        { id: 'a b', name: 'A B', match: [] },
        { id: 'c', name: 'C', match: [] },
        { id: 'a', name: 'A', match: [] },
        { id: 'b c', name: 'B C', match: [] },
      ]
      const files = g.nodes.filter((node) => node.kind === 'file').slice(0, 4)
      files[0]!.layer = 'a b'
      files[1]!.layer = 'c'
      files[2]!.layer = 'a'
      files[3]!.layer = 'b c'
      g.edges = [
        {
          id: 'x1',
          kind: 'import',
          granularity: 'file',
          from: files[0]!.id,
          to: files[1]!.id,
          importKind: 'value',
          specifier: './x',
        },
        {
          id: 'x2',
          kind: 'import',
          granularity: 'file',
          from: files[2]!.id,
          to: files[3]!.id,
          importKind: 'value',
          specifier: './y',
        },
      ]
      g.cycles = []
      g.unresolved = []
    })

    const flows = vm.layerFlows('file')
    // 「a b → c」と「a → b c」。潰すとどちらも "a b c" になって合算される
    expect(flows).toHaveLength(2)
    expect(flows.every((flow) => flow.count === 1)).toBe(true)
  })

  it('依存が 1 本も無くても壊れない', () => {
    const vm = vmOf((g) => {
      g.edges = []
      g.cycles = []
    })

    expect(vm.layerFlows('file')).toEqual([])
  })
})

describe('被依存の層別内訳（US-11）', () => {
  it('内訳の合計が被依存数と一致する', () => {
    // 数え方が揃っていないと、同じ画面に食い違う 2 つの数が出る
    const vm = vmOf()

    for (const node of vm.nodes.file) {
      const byLayer = vm.fanInByLayerOf(node.id, 'file')
      const total = [...byLayer.values()].reduce((sum, count) => sum + count, 0)
      expect(total).toBe(vm.fanInOf(node.id, 'file'))
    }
  })

  it('同じ 2 ノード間の複数エッジを 1 と数える', () => {
    const target = vmOf().nodes.file.find((node) => vmOf().fanInOf(node.id, 'file') > 0)!
    const before = vmOf().fanInByLayerOf(target.id, 'file')
    const after = vmOf((g) => {
      const edge = g.edges.find((e) => e.granularity === 'file' && e.to === target.id)!
      g.edges.push({ ...edge, id: `${edge.id}:dup` })
    }).fanInByLayerOf(target.id, 'file')

    expect([...after.entries()]).toEqual([...before.entries()])
  })

  it('内訳の並びが、層の並びと同じ', () => {
    /*
     * 出現順のままだと、行ごとに同じ層が違う位置に出て、行どうしを見比べられない。
     *
     * **正本 JSON の並びが層の並びと逆になる形を作る。** フィクスチャのままでは
     * 両者が偶然一致していて、並べ替えを外しても通ってしまう
     */
    const vm = vmOf((g) => {
      const files = g.nodes.filter((node) => node.kind === 'file')
      const used = files[0]!
      const last = files[1]!
      const first = files[2]!
      last.layer = g.layers.at(-1)!.id
      first.layer = g.layers[0]!.id
      // 後ろの層から先に依存させる
      g.edges = [
        {
          id: 'x1',
          kind: 'import',
          granularity: 'file',
          from: last.id,
          to: used.id,
          importKind: 'value',
          specifier: './x',
        },
        {
          id: 'x2',
          kind: 'import',
          granularity: 'file',
          from: first.id,
          to: used.id,
          importKind: 'value',
          specifier: './y',
        },
      ]
      g.cycles = []
      g.unresolved = []
    })
    const order = new Map(vm.layerKeys.map((key, index) => [key, index]))

    for (const node of vm.nodes.file) {
      const keys = [...vm.fanInByLayerOf(node.id, 'file').keys()]
      const ranks = keys.map((key) => order.get(key) ?? -1)
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }
    expect([...vm.fanInByLayerOf(vm.nodes.file[0]!.id, 'file')]).toHaveLength(2)
  })

  it('使われていないノードは空', () => {
    const vm = vmOf()
    const unused = vm.nodes.file.find((node) => vm.fanInOf(node.id, 'file') === 0)!

    expect(vm.fanInByLayerOf(unused.id, 'file').size).toBe(0)
  })

  it('層が未設定の依存元も数える', () => {
    const vm = vmOf((g) => {
      for (const node of g.nodes) if (node.kind === 'file') delete node.layer
    })
    const used = vm.nodes.file.find((node) => vm.fanInOf(node.id, 'file') > 0)!

    expect(vm.fanInByLayerOf(used.id, 'file').get(NO_LAYER)).toBe(vm.fanInOf(used.id, 'file'))
  })
})
