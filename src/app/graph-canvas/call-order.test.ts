import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph, type GraphNode } from '@/core/graph/schema'
import { buildViewModel, type Granularity } from '@/core/ir/view-model'
import { callOrder } from './call-order'

import fixture from '../../../test-data/dependency-graph.complex.json'

function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}
const vmOf = (mutate?: (g: DependencyGraph) => void) => buildViewModel(graphOf(mutate))

const viewModel = vmOf()

/** 呼び出しを 2 本以上持ち、依存元もいるメソッド。順序が効く題材 */
const caller = viewModel.nodes.method.find(
  (node) =>
    viewModel.edges.method.filter(
      (edge) => edge.from === node.id && (edge.kind === 'call' || edge.kind === 'construct'),
    ).length > 1 && viewModel.dependentsOf(node.id, 'method').length > 0,
)!

const orderFor = (selectedNodeId: string, granularity: Granularity = 'method', model = viewModel) =>
  callOrder({ viewModel: model, granularity, selectedNodeId })

const node = (id: string) => ({ id }) as GraphNode

describe('呼び出し順の並び（US-05）', () => {
  it('依存先が sourceOrder の昇順に並ぶ', () => {
    const { keyOf } = orderFor(caller.id)
    const calls = viewModel.edges.method
      .filter(
        (edge) => edge.from === caller.id && (edge.kind === 'call' || edge.kind === 'construct'),
      )
      .map((edge) => ({ to: edge.to, order: 'sourceOrder' in edge ? edge.sourceOrder : 0 }))

    expect(calls.length).toBeGreaterThan(1)
    const sorted = [...calls].sort((a, b) => a.order - b.order)
    const byKey = [...calls].sort((a, b) =>
      (keyOf(node(a.to)) ?? '').localeCompare(keyOf(node(b.to)) ?? ''),
    )

    expect(byKey.map((entry) => entry.to)).toEqual(sorted.map((entry) => entry.to))
  })

  it('選択そのものは、自分の列の先頭に来る', () => {
    const { keyOf } = orderFor(caller.id)
    const other = viewModel.edges.method.find((edge) => edge.from === caller.id)!.to

    expect(keyOf(node(caller.id))!.localeCompare(keyOf(node(other))!)).toBeLessThan(0)
  })

  it('依存元にはキーを与えない', () => {
    // `sourceOrder` は呼ぶ側の本体の中での採番。依存元に当てると、選択とは
    // 無関係な採番空間の数値で並べることになる。US-05 は依存先の順序を言う
    const dependent = viewModel
      .dependentsOf(caller.id, 'method')
      .find(
        (entry) =>
          !viewModel
            .dependenciesOf(caller.id, 'method')
            .some((dependency) => dependency.node.id === entry.node.id),
      )!
    const { keyOf } = orderFor(caller.id)

    expect(keyOf(dependent.node)).toBeUndefined()
  })

  it('順序を持たないエッジの相手は、持つものの後ろへ置く', () => {
    // `sourceOrder` は call / construct にしか無い。ここで順序を捏造しない
    const implementing = viewModel.nodes.method.find((n) =>
      viewModel.edges.method.some((edge) => edge.from === n.id && edge.kind === 'implements'),
    )!
    const model = vmOf((graph) => {
      // 順序を持つ依存先を 2 件足し、混在させる
      const targets = graph.nodes
        .filter((n) => n.kind === 'method' && n.id !== implementing.id)
        .slice(0, 2)
      targets.forEach((target, index) => {
        graph.edges.push({
          id: `probe:${index}`,
          from: implementing.id,
          to: target.id,
          kind: 'call',
          granularity: 'method',
          resolution: 'static',
          sourceOrder: index,
        })
      })
    })
    const implemented = viewModel.edges.method.find(
      (edge) => edge.from === implementing.id && edge.kind === 'implements',
    )!.to
    const { keyOf } = orderFor(implementing.id, 'method', model)
    const ordered = model
      .dependenciesOf(implementing.id, 'method')
      .filter((dependency) => dependency.edge.kind === 'call')

    for (const dependency of ordered) {
      expect(keyOf(node(implemented))!.localeCompare(keyOf(dependency.node)!)).toBeGreaterThan(0)
    }
  })

  it('同じ相手へ複数のエッジが向いていても、最も早い出現順を採る', () => {
    // 同一ペアに複数エッジは実在する（相互呼び出し・再掲の import）。
    // 配列で先に現れたほうを採ると、後ろの小さい `sourceOrder` を落とす
    const [first, second] = viewModel
      .dependenciesOf(caller.id, 'method')
      .map((dependency) => dependency.node.id)
    const model = vmOf((graph) => {
      graph.edges.push({
        id: 'probe:late',
        from: caller.id,
        to: second!,
        kind: 'call',
        granularity: 'method',
        resolution: 'static',
        sourceOrder: 999,
      })
    })
    const { keyOf } = orderFor(caller.id, 'method', model)

    // 遅い呼び出しを足しても、その相手は元の位置（first の直後）に留まる
    expect(keyOf(node(second!))!.localeCompare(keyOf(node(first!))!)).toBeGreaterThan(0)
    const later = model
      .dependenciesOf(caller.id, 'method')
      .map((dependency) => dependency.node.id)
      .filter((id) => id !== first && id !== second)
    for (const id of later) {
      expect(keyOf(node(second!))!.localeCompare(keyOf(node(id))!)).toBeLessThan(0)
    }
  })

  it('順序を持つ依存先が 1 件しか無ければ、並びに口を出さない', () => {
    // 1 件では「順に並んでいる」と言えるものが無い。既定の並びへ落とす
    const single = viewModel.nodes.method.find((n) => {
      const calls = viewModel
        .dependenciesOf(n.id, 'method')
        .filter((d) => d.edge.kind === 'call' || d.edge.kind === 'construct')
      return calls.length === 1
    })!
    const order = orderFor(single.id)

    expect(order.applies).toBe(false)
    expect(order.keyOf(single)).toBeUndefined()
  })

  it('ファイル粒度では順序の材料が無いので、既定の並びのまま', () => {
    // `sourceOrder` は call / construct、すなわちメソッド粒度にしか無い
    // （スキーマ §3）。材料が無いところで出現順を名乗らない（C-7）
    const file = viewModel.nodes.file.find(
      (n) => viewModel.dependenciesOf(n.id, 'file').length > 1,
    )!
    const order = orderFor(file.id, 'file')

    expect(viewModel.edges.file.every((edge) => !('sourceOrder' in edge))).toBe(true)
    expect(order.applies).toBe(false)
    for (const dependency of viewModel.dependenciesOf(file.id, 'file')) {
      expect(order.keyOf(dependency.node)).toBeUndefined()
    }
  })

  it('同じ並びを何度作っても変わらない', () => {
    const first = orderFor(caller.id).keyOf
    const second = orderFor(caller.id).keyOf

    for (const n of viewModel.nodes.method) {
      expect(second(n)).toBe(first(n))
    }
  })

  it('依存先が 10 件を超えても、文字列比較が並び順と一致する', () => {
    // キーは文字列として比べる。桁を揃えないと 10 番目が 9 番目より前へ来る
    const targets = viewModel.nodes.method.filter((n) => n.id !== caller.id).slice(0, 12)
    const model = vmOf((graph) => {
      graph.edges = graph.edges.filter((edge) => edge.from !== caller.id)
      targets.forEach((target, index) => {
        graph.edges.push({
          id: `probe:${index}`,
          from: caller.id,
          to: target.id,
          kind: 'call',
          granularity: 'method',
          resolution: 'static',
          sourceOrder: index,
        })
      })
    })
    const { keyOf } = orderFor(caller.id, 'method', model)
    const keys = targets.map((target) => keyOf(target)!)

    expect(keys.every((key) => key !== undefined)).toBe(true)
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(keys)
  })
})
