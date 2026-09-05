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

describe('粒度ごとの出し分け', () => {
  it('ノードを kind で分ける', () => {
    const vm = buildViewModel(graphOf())

    expect(vm.nodes.file).toHaveLength(28)
    expect(vm.nodes.method).toHaveLength(60)
  })

  it('エッジを granularity で分ける', () => {
    const vm = buildViewModel(graphOf())

    expect(vm.edges.file).toHaveLength(69)
    expect(vm.edges.method).toHaveLength(71)
  })

  it('正本 JSON の並びを保つ', () => {
    const graph = graphOf()
    const vm = buildViewModel(graph)

    expect(vm.nodes.file.map((n) => n.id)).toEqual(
      graph.nodes.filter((n) => n.kind === 'file').map((n) => n.id),
    )
  })

  it('ID から引ける', () => {
    const vm = buildViewModel(graphOf())

    expect(vm.nodeById.get('file:src/domain/Todo.ts')?.name).toBe('Todo.ts')
    expect(vm.edgeById.get('e_0001')?.id).toBe('e_0001')
  })
})

describe('層の引き当て', () => {
  it('ノードから層を引ける', () => {
    const vm = buildViewModel(graphOf())
    const binding = vm.layerOf('file:src/domain/Todo.ts')

    expect(binding.key).toBe('domain')
    expect(binding.layer?.name).toBe('Domain')
  })

  it('層ごとにノードを引ける', () => {
    const vm = buildViewModel(graphOf())
    const total = vm.layerKeys.reduce((sum, k) => sum + (vm.nodesByLayer.get(k)?.length ?? 0), 0)

    expect(total).toBe(88)
  })

  it('層が未設定のノードは NO_LAYER にまとまる（ADR-002）', () => {
    const vm = buildViewModel(
      graphOf((g) => {
        delete g.nodes[0]!.layer
      }),
    )

    expect(vm.layerOf(vm.nodes.file[0]!.id).key).toBe(NO_LAYER)
    expect(vm.nodesByLayer.get(NO_LAYER)).toHaveLength(1)
  })

  it('層なしは層キーの末尾に来る', () => {
    const vm = buildViewModel(
      graphOf((g) => {
        delete g.nodes[0]!.layer
      }),
    )

    expect(vm.layerKeys.at(-1)).toBe(NO_LAYER)
    expect(vm.layerKeys.slice(0, -1)).toEqual([
      'presentation',
      'usecase',
      'domain',
      'infra',
      'shared',
      'di',
    ])
  })

  it('層なしのノードが無ければ NO_LAYER は現れない', () => {
    const vm = buildViewModel(graphOf())

    expect(vm.layerKeys).not.toContain(NO_LAYER)
  })

  it('存在しないノード ID でも引ける（例外にしない）', () => {
    const vm = buildViewModel(graphOf())

    expect(vm.layerOf('file:src/無い.ts').key).toBe(NO_LAYER)
  })
})

describe('メソッドの所属', () => {
  it('ファイルからメソッドを引ける', () => {
    const vm = buildViewModel(graphOf())
    const methods = vm.methodsOfFile.get('file:src/domain/Todo.ts')

    expect(methods?.every((m) => m.kind === 'method')).toBe(true)
    expect(methods?.length).toBeGreaterThan(0)
  })

  it('メソッドから所属ファイルを引ける', () => {
    const vm = buildViewModel(graphOf())
    const file = vm.fileOfMethod('method:src/domain/Todo.ts#Todo.complete')

    expect(file?.id).toBe('file:src/domain/Todo.ts')
  })

  it('引き当ての総数がメソッド数と一致する', () => {
    const vm = buildViewModel(graphOf())
    const total = [...vm.methodsOfFile.values()].reduce((sum, ms) => sum + ms.length, 0)

    expect(total).toBe(60)
  })

  it('ファイルノードを渡しても所属ファイルは返らない', () => {
    const vm = buildViewModel(graphOf())

    expect(vm.fileOfMethod('file:src/domain/Todo.ts')).toBeUndefined()
  })
})
