import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '../graph/schema'
import { sortBySourceOrder } from './traversal'
import { buildViewModel } from './view-model'

const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)
const fixture: unknown = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'))

function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}
const vmOf = (mutate?: (g: DependencyGraph) => void) => buildViewModel(graphOf(mutate))

/** via-interface のエッジを 1 本選ぶ */
function pickViaInterface(graph: DependencyGraph) {
  const edge = graph.edges.find(
    (e) => (e.kind === 'call' || e.kind === 'construct') && e.resolution === 'via-interface',
  )!
  if (edge.kind !== 'call' && edge.kind !== 'construct') throw new Error('call/construct を期待')
  return edge
}

describe('依存先', () => {
  it('エッジの向き（使う側 → 使われる側）にたどる', () => {
    const vm = vmOf()
    const edge = vm.edges.file[0]!
    const found = vm.dependenciesOf(edge.from, 'file')

    expect(found.map((d) => d.node.id)).toContain(edge.to)
  })

  it('依存を持たないノードは 0 件', () => {
    const vm = vmOf()
    const leaf = vm.nodes.file.find((n) => vm.dependenciesOf(n.id, 'file').length === 0)

    expect(leaf).toBeDefined()
  })

  it('粒度をまたがない', () => {
    const vm = vmOf()
    const method = vm.nodes.method[0]!.id

    expect(vm.dependenciesOf(method, 'file')).toEqual([])
  })

  it('存在しないノードは 0 件', () => {
    expect(vmOf().dependenciesOf('file:src/無い.ts', 'file')).toEqual([])
  })
})

describe('ソース上の出現順（US-05 / C-7）', () => {
  it('sourceOrder の昇順に並ぶ', () => {
    const vm = vmOf()
    const caller = vm.edges.method.find((e) => e.kind === 'call')!.from
    const orders = vm
      .dependenciesOf(caller, 'method')
      .map((d) =>
        d.edge.kind === 'call' || d.edge.kind === 'construct' ? d.edge.sourceOrder : undefined,
      )
      .filter((o): o is number => o !== undefined)

    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('sourceOrder を持たないエッジ（import / implements）は後ろに置く', () => {
    const vm = vmOf()
    // implements と call を同じ from から出すよう合成する
    const mixed = vmOf((g) => {
      const call = g.edges.find((e) => e.kind === 'call')!
      const impl = g.edges.find((e) => e.kind === 'implements')!
      impl.from = call.from
    })
    const caller = vm.edges.method.find((e) => e.kind === 'call')!.from
    const kinds = mixed.dependenciesOf(caller, 'method').map((d) => d.edge.kind)

    // 空配列だと indexOf も length-1 も -1 になり、依存先が 0 件でも通ってしまう
    expect(kinds.length).toBeGreaterThan(1)
    expect(kinds.at(-1)).toBe('implements')
  })

  it('順序を捏造しない（sourceOrder が無ければ正本 JSON の並び）', () => {
    const vm = vmOf()
    const importer = vm.edges.file[0]!.from
    const found = vm.dependenciesOf(importer, 'file')
    const original = vm.edges.file.filter((e) => e.from === importer).map((e) => e.id)

    expect(found.map((d) => d.edge.id)).toEqual(original)
  })
})

describe('並べ替えの規則（合成データで固定）', () => {
  /** 同じ from から出る call を、sourceOrder と逆順に並べたグラフを作る */
  const scrambled = () =>
    vmOf((g) => {
      const from = g.nodes.find((n) => n.kind === 'method')!.id
      const to = g.nodes
        .filter((n) => n.kind === 'method')
        .slice(1, 4)
        .map((n) => n.id)
      g.edges = [
        {
          id: 'x3',
          kind: 'call',
          granularity: 'method',
          from,
          to: to[0]!,
          resolution: 'static',
          sourceOrder: 3,
        },
        {
          id: 'x1',
          kind: 'call',
          granularity: 'method',
          from,
          to: to[1]!,
          resolution: 'static',
          sourceOrder: 1,
        },
        {
          id: 'x2',
          kind: 'call',
          granularity: 'method',
          from,
          to: to[2]!,
          resolution: 'static',
          sourceOrder: 2,
        },
      ]
      g.cycles = []
      g.unresolved = []
    })

  it('正本 JSON の並びではなく sourceOrder で並べ替える', () => {
    const vm = scrambled()
    const from = vm.nodes.method[0]!.id

    expect(vm.dependenciesOf(from, 'method').map((d) => d.edge.id)).toEqual(['x1', 'x2', 'x3'])
  })

  it('sourceOrder を持たないエッジは、持つエッジより後ろに来る', () => {
    const vm = vmOf((g) => {
      const from = g.nodes.find((n) => n.kind === 'method')!.id
      const to = g.nodes
        .filter((n) => n.kind === 'method')
        .slice(1, 3)
        .map((n) => n.id)
      g.edges = [
        { id: 'impl', kind: 'implements', granularity: 'method', from, to: to[0]! },
        {
          id: 'call',
          kind: 'call',
          granularity: 'method',
          from,
          to: to[1]!,
          resolution: 'static',
          sourceOrder: 5,
        },
      ]
      g.cycles = []
      g.unresolved = []
    })
    const from = vm.nodes.method[0]!.id

    // 正本 JSON では implements が先だが、sourceOrder を持つ call が前に来る
    expect(vm.dependenciesOf(from, 'method').map((d) => d.edge.id)).toEqual(['call', 'impl'])
  })
})

describe('sortBySourceOrder', () => {
  const withOrder = (id: string, sourceOrder: number) => ({
    edge: {
      id,
      kind: 'call',
      granularity: 'method',
      from: 'a',
      to: 'b',
      resolution: 'static',
      sourceOrder,
    },
  })
  const withoutOrder = (id: string) => ({
    edge: { id, kind: 'implements', granularity: 'method', from: 'a', to: 'b' },
  })

  it.each([
    [
      '昇順で渡す',
      () => [withOrder('o1', 1), withOrder('o2', 2), withoutOrder('n1'), withoutOrder('n2')],
    ],
    [
      '降順で渡す',
      () => [withoutOrder('n2'), withoutOrder('n1'), withOrder('o2', 2), withOrder('o1', 1)],
    ],
    [
      '混ぜて渡す',
      () => [withoutOrder('n1'), withOrder('o2', 2), withoutOrder('n2'), withOrder('o1', 1)],
    ],
  ])('%s ても、順序を持つものが先・持たないものが後ろ', (_label, build) => {
    const sorted = sortBySourceOrder(build() as never)
    const ids = sorted.map((x: { edge: { id: string } }) => x.edge.id)

    expect(ids.slice(0, 2)).toEqual(['o1', 'o2'])
    expect(ids.slice(2).sort()).toEqual(['n1', 'n2'])
  })

  it('順序を持たないもの同士は渡された並びを保つ', () => {
    const sorted = sortBySourceOrder([withoutOrder('b'), withoutOrder('a')] as never)

    expect(sorted.map((x: { edge: { id: string } }) => x.edge.id)).toEqual(['b', 'a'])
  })
})

describe('via-interface のたどり方', () => {
  it('既定（logical）は to をたどる', () => {
    const graph = graphOf()
    const edge = pickViaInterface(graph)
    const found = buildViewModel(graph).dependenciesOf(edge.from, 'method')
    const hit = found.find((d) => d.edge.id === edge.id)!

    expect(hit.node.id).toBe(edge.to)
    expect(hit.viaImplementation).toBe(false)
  })

  it('actual は implementations をたどる', () => {
    const graph = graphOf()
    const edge = pickViaInterface(graph)
    const found = buildViewModel(graph).dependenciesOf(edge.from, 'method', { via: 'actual' })
    const hits = found.filter((d) => d.edge.id === edge.id)

    expect(hits.map((d) => d.node.id).sort()).toEqual([...edge.implementations!].sort())
    expect(hits.every((d) => d.viaImplementation)).toBe(true)
  })

  it('implementations が複数なら、その数だけ返る', () => {
    const graph = graphOf()
    const edge = graph.edges.find(
      (e) => (e.kind === 'call' || e.kind === 'construct') && (e.implementations?.length ?? 0) > 1,
    )!
    const found = buildViewModel(graph)
      .dependenciesOf(edge.from, 'method', { via: 'actual' })
      .filter((d) => d.edge.id === edge.id)

    expect(found.length).toBeGreaterThan(1)
  })

  it('implementations が空なら actual でも to に落ちる', () => {
    const graph = graphOf()
    const edge = pickViaInterface(graph)
    const target = edge.id
    const vm = buildViewModel(
      graphOf((g) => {
        const e = g.edges.find((x) => x.id === target)!
        if (e.kind === 'call' || e.kind === 'construct') e.implementations = []
      }),
    )
    const hit = vm
      .dependenciesOf(edge.from, 'method', { via: 'actual' })
      .find((d) => d.edge.id === target)!

    expect(hit.node.id).toBe(edge.to)
    expect(hit.viaImplementation).toBe(false)
  })

  it('**どちらか一方に潰さない**（同じエッジから両方の答えが取れる）', () => {
    const graph = graphOf()
    const edge = pickViaInterface(graph)
    const vm = buildViewModel(graph)

    const logical = vm.dependenciesOf(edge.from, 'method').filter((d) => d.edge.id === edge.id)
    const actual = vm
      .dependenciesOf(edge.from, 'method', { via: 'actual' })
      .filter((d) => d.edge.id === edge.id)

    expect(logical.map((d) => d.node.id)).not.toEqual(actual.map((d) => d.node.id))
  })
})

describe('implementations が引けないとき', () => {
  it('1 件も引けなければ to に落ちる（actual で依存が消えない）', () => {
    const graph = graphOf()
    const edge = pickViaInterface(graph)
    const vm = buildViewModel(
      graphOf((g) => {
        const e = g.edges.find((x) => x.id === edge.id)!
        if (e.kind === 'call' || e.kind === 'construct')
          e.implementations = ['method:src/無い.ts#A.b']
      }),
    )

    const hits = vm
      .dependenciesOf(edge.from, 'method', { via: 'actual' })
      .filter((d) => d.edge.id === edge.id)

    expect(hits).toHaveLength(1)
    expect(hits[0]?.node.id).toBe(edge.to)
    expect(hits[0]?.viaImplementation).toBe(false)
  })

  it('一部だけ引ければ、引けた分を返す', () => {
    const graph = graphOf()
    const edge = graph.edges.find(
      (e) => (e.kind === 'call' || e.kind === 'construct') && (e.implementations?.length ?? 0) > 1,
    )!
    const kept = (
      edge.kind === 'call' || edge.kind === 'construct' ? edge.implementations! : []
    )[0]!
    const vm = buildViewModel(
      graphOf((g) => {
        const e = g.edges.find((x) => x.id === edge.id)!
        if (e.kind === 'call' || e.kind === 'construct')
          e.implementations = [kept, 'method:src/無い.ts#A.b']
      }),
    )

    const hits = vm
      .dependenciesOf(edge.from, 'method', { via: 'actual' })
      .filter((d) => d.edge.id === edge.id)

    expect(hits.map((d) => d.node.id)).toEqual([kept])
  })
})
describe('依存元（US-14）', () => {
  it('このノードを使っているノードを引く', () => {
    const vm = vmOf()
    const edge = vm.edges.file[0]!

    expect(vm.dependentsOf(edge.to, 'file').map((d) => d.node.id)).toContain(edge.from)
  })

  it('重複ペアが無ければ被依存数と件数が一致する', () => {
    const vm = vmOf()
    for (const node of vm.nodes.file) {
      expect(vm.dependentsOf(node.id, 'file')).toHaveLength(vm.fanInOf(node.id, 'file'))
    }
  })

  it('**重複ペアがあると数え方の違いが出る**（fanIn はノード単位、依存元はエッジ単位）', () => {
    // 「A が B を 2 回呼ぶ」は実コードで起きる（UT-02 の実データ確認）。
    // フィクスチャには無いので、同じ from / to のエッジを合成して差を作る
    const target = graphOf().edges.find((e) => e.kind === 'import')!
    const vm = vmOf((g) => {
      const edge = g.edges.find((e) => e.id === target.id)!
      g.edges.push({ ...edge, id: `${edge.id}-dup` })
    })

    // 使っている「箇所」は増えていないので被依存数は変わらない
    expect(vm.fanInOf(target.to, 'file')).toBe(2)
    // 経路となったエッジは潰さないので依存元は 1 件増える
    const dependents = vm.dependentsOf(target.to, 'file')
    expect(dependents).toHaveLength(3)
    expect(new Set(dependents.map((d) => d.node.id)).size).toBe(2)
    // 畳む口は IR が持つ。消費側が毎回 Set を書かなくてよい
    expect(vm.dependentNodesOf(target.to, 'file')).toHaveLength(2)
  })

  it('**畳んだ依存元は被依存数と件数が一致する**（重複ペアがあっても）', () => {
    const target = graphOf().edges.find((e) => e.kind === 'import')!
    const vm = vmOf((g) => {
      const edge = g.edges.find((e) => e.id === target.id)!
      g.edges.push({ ...edge, id: `${edge.id}-dup` })
    })

    for (const node of vm.nodes.file) {
      expect(vm.dependentNodesOf(node.id, 'file')).toHaveLength(vm.fanInOf(node.id, 'file'))
    }
  })

  it('畳んだ依存元は正本 JSON の並びを保つ', () => {
    const vm = vmOf()
    const target = vm.edges.file[0]!.to
    const expected = vm.edges.file.filter((e) => e.to === target).map((e) => e.from)

    expect(vm.dependentNodesOf(target, 'file').map((n) => n.id)).toEqual([...new Set(expected)])
  })

  it('**依存先と対称にたどれる**（actual で実装ノードから呼び出し元が引ける）', () => {
    const graph = graphOf()
    const edge = pickViaInterface(graph)
    const implementation = edge.implementations![0]!
    const vm = buildViewModel(graph)

    // logical では実装ノードの依存元に現れない
    expect(vm.dependentsOf(implementation, 'method').map((d) => d.node.id)).not.toContain(edge.from)
    // actual では現れる
    expect(
      vm.dependentsOf(implementation, 'method', { via: 'actual' }).map((d) => d.node.id),
    ).toContain(edge.from)
  })

  it('**対称であるぶん、actual ではインターフェース側から呼び出し元が消える**', () => {
    const graph = graphOf()
    const edge = pickViaInterface(graph)
    const vm = buildViewModel(graph)

    // エッジは実装ノードの側へ移る。両方に現れると 1 本の呼び出しが 2 件に見える
    expect(vm.dependentsOf(edge.to, 'method').map((d) => d.edge.id)).toContain(edge.id)
    expect(
      vm.dependentsOf(edge.to, 'method', { via: 'actual' }).map((d) => d.edge.id),
    ).not.toContain(edge.id)
    // implements のように implementations を持たないエッジは actual でも残る
    expect(
      vm
        .dependentsOf(edge.to, 'method', { via: 'actual' })
        .every((d) => d.edge.kind === 'implements'),
    ).toBe(true)
  })

  it('**implementations の重複はたどる前に畳む**', () => {
    const graph = graphOf()
    const target = pickViaInterface(graph)
    const vm = vmOf((g) => {
      const e = g.edges.find((x) => x.id === target.id)!
      // UT-01 の整合性検査は配列内の重複を防いでいない
      if (e.kind === 'call' || e.kind === 'construct')
        e.implementations = [...e.implementations!, e.implementations![0]!]
    })
    const found = vm
      .dependenciesOf(target.from, 'method', { via: 'actual' })
      .filter((d) => d.edge.id === target.id)
    const ids = found.map((d) => d.node.id)

    expect(ids).toHaveLength(new Set(ids).size)
    expect(ids).toHaveLength(new Set(target.implementations!).size)
  })

  it('誰からも使われていないノードは 0 件', () => {
    const vm = vmOf()
    const roots = vm.nodes.file.filter((n) => vm.dependentsOf(n.id, 'file').length === 0)

    expect(roots).toHaveLength(4)
  })
})
