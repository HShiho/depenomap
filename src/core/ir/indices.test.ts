import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type Cycle, type DependencyGraph } from '../graph/schema'
import { buildFanIn, sortByFanInDesc, typeOnlyStateOf } from './indices'
import { buildViewModel } from './view-model'

const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)
const fixture: unknown = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'))

function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}
const vmOf = (mutate?: (g: DependencyGraph) => void) => buildViewModel(graphOf(mutate))

describe('被依存数', () => {
  it('実データの上位が一致する', () => {
    const vm = vmOf()

    expect(vm.fanInOf('file:src/domain/Todo.ts', 'file')).toBe(10)
    expect(vm.fanInOf('file:src/domain/ITodoRepository.ts', 'file')).toBe(6)
  })

  it('粒度ごとに独立して数える', () => {
    const vm = vmOf()

    // file 粒度のノードは method 粒度では数えられない
    expect(vm.fanInOf('file:src/domain/Todo.ts', 'method')).toBe(0)
    expect(vm.fanInOf('method:src/infra/db/connection.ts#query', 'method')).toBe(7)
  })

  it('誰からも使われていないノードは 0', () => {
    const vm = vmOf()
    const roots = vm.nodes.file.filter((n) => vm.fanInOf(n.id, 'file') === 0)

    expect(roots).toHaveLength(4)
  })

  it('存在しないノードは 0', () => {
    expect(vmOf().fanInOf('file:src/無い.ts', 'file')).toBe(0)
  })

  it('**同じ 2 ノード間の複数エッジを 1 と数える**', () => {
    // フィクスチャに重複ペアは無いので、合成して差を作る
    const edges = [
      {
        id: 'e1',
        kind: 'call',
        granularity: 'method',
        from: 'A',
        to: 'B',
        resolution: 'static',
        sourceOrder: 1,
      },
      {
        id: 'e2',
        kind: 'call',
        granularity: 'method',
        from: 'A',
        to: 'B',
        resolution: 'static',
        sourceOrder: 2,
      },
      {
        id: 'e3',
        kind: 'call',
        granularity: 'method',
        from: 'C',
        to: 'B',
        resolution: 'static',
        sourceOrder: 1,
      },
    ] as const

    // A が B を 2 回呼んでも、B を使っている箇所は A と C の 2 つ
    expect(buildFanIn(edges).get('B')).toBe(2)
  })
})

describe('被依存数の降順（US-10）', () => {
  it('多い順に並べる', () => {
    const vm = vmOf()
    const sorted = sortByFanInDesc(
      vm.nodes.file,
      new Map(vm.nodes.file.map((n) => [n.id, vm.fanInOf(n.id, 'file')])),
    )

    expect(sorted[0]?.id).toBe('file:src/domain/Todo.ts')
    expect(vm.fanInOf(sorted[0]!.id, 'file')).toBe(10)
  })

  it('同数のときは正本 JSON の並びを保つ', () => {
    const nodes = vmOf().nodes.file
    const flat = new Map(nodes.map((n) => [n.id, 1]))

    expect(sortByFanInDesc(nodes, flat).map((n) => n.id)).toEqual(nodes.map((n) => n.id))
  })
})

describe('循環の引き当て', () => {
  it('ノードから、それが含まれる循環を引ける', () => {
    const vm = vmOf()
    const cycles = vm.cyclesOf('file:src/domain/Todo.ts')

    expect(cycles.map((c) => c.id)).toContain('c_0001')
  })

  it('循環に含まれないノードは空', () => {
    expect(vmOf().cyclesOf('file:src/di/container.ts')).toEqual([])
  })

  it('複数の循環に属するノードは全部返る', () => {
    const vm = vmOf((g) => {
      g.cycles[1]!.nodes = [...g.cycles[1]!.nodes, 'file:src/domain/Todo.ts']
    })

    expect(vm.cyclesOf('file:src/domain/Todo.ts').map((c) => c.id)).toEqual(['c_0001', 'c_0002'])
  })

  it('実データで循環に含まれるノードは 11 件', () => {
    const vm = vmOf()
    const inCycle = [...vm.nodes.file, ...vm.nodes.method].filter(
      (n) => vm.cyclesOf(n.id).length > 0,
    )

    expect(inCycle).toHaveLength(11)
  })
})

describe('typeOnly の 3 状態', () => {
  const cycle = (typeOnly?: boolean): Cycle => ({
    id: 'c',
    nodes: ['a'],
    edges: ['e'],
    ...(typeOnly === undefined ? {} : { typeOnly }),
  })

  it.each([
    [true, 'type-only'],
    [false, 'not-type-only'],
  ])('typeOnly=%s は %s', (value, expected) => {
    expect(typeOnlyStateOf(cycle(value))).toBe(expected)
  })

  it('**欠落を false に潰さない**（していない判定をしない / N-1）', () => {
    expect(typeOnlyStateOf(cycle(undefined))).toBe('unknown')
    expect(typeOnlyStateOf(cycle(undefined))).not.toBe('not-type-only')
  })

  it('実データでは method 粒度の循環が unknown になる', () => {
    const graph = graphOf()
    const states = graph.cycles.map((c) => typeOnlyStateOf(c))

    expect(states.filter((s) => s === 'unknown')).toHaveLength(2)
  })
})

describe('未解決依存の引き当て', () => {
  it('追跡が止まった箇所から引ける', () => {
    const vm = vmOf()
    const items = vm.unresolvedFrom('method:src/presentation/TodoController.ts#TodoController.post')

    expect(items.map((u) => u.id)).toContain('u_0001')
  })

  it('候補として推測されている側からも引ける', () => {
    const vm = vmOf()
    const items = vm.unresolvedCandidatesFor('method:src/usecase/CreateTodo.ts#CreateTodo.execute')

    expect(items.length).toBeGreaterThan(0)
  })

  it('**事実（追跡が止まった）と推測（候補）を混ぜない**', () => {
    const vm = vmOf()
    const origin = 'method:src/presentation/TodoController.ts#TodoController.post'

    // 起点として引けるが、候補としては引けない
    expect(vm.unresolvedFrom(origin).length).toBeGreaterThan(0)
    expect(vm.unresolvedCandidatesFor(origin)).toEqual([])
  })

  it('候補が空の未解決も、起点からは引ける', () => {
    const vm = vmOf()
    const dynamicProperty = graphOf().unresolved.find((u) => u.candidates.length === 0)!

    expect(vm.unresolvedFrom(dynamicProperty.from).map((u) => u.id)).toContain(dynamicProperty.id)
  })

  it('紐づかないノードは空', () => {
    expect(vmOf().unresolvedFrom('file:src/domain/Todo.ts')).toEqual([])
  })
})
