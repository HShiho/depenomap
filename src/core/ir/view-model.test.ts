import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '../graph/schema'
import { buildViewModel, NO_LAYER, type Granularity, type ViewModel } from './view-model'

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

  it('バケットの中身がキーと一致する', () => {
    // 合計だけを見ると、全ノードを 1 つのバケットへ入れる実装でも通る
    const vm = buildViewModel(graphOf())

    for (const [key, list] of vm.nodesByLayer) {
      for (const node of list) {
        if (key === NO_LAYER) expect(node.layer).toBeUndefined()
        else expect(node.layer).toBe(key)
      }
    }
  })

  it('層なしのノードも同じ規則で入る', () => {
    const vm = buildViewModel(
      graphOf((g) => {
        delete g.nodes[0]!.layer
      }),
    )

    expect(vm.nodesByLayer.get(NO_LAYER)?.every((n) => n.layer === undefined)).toBe(true)
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

  it('**ノードが 1 件も属していない層も落とさない**（層は JSON が権威 / ADR-002）', () => {
    const vm = buildViewModel(
      graphOf((g) => {
        g.layers.push({ id: 'empty', name: '空の層', match: ['src/未使用/**'] })
      }),
    )

    expect(vm.layerKeys).toContain('empty')
    expect(vm.nodesByLayer.get('empty')).toEqual([])
  })

  it('**層キーは必ずバケットを持つ**（回すだけで undefined を踏まない）', () => {
    const vm = buildViewModel(
      graphOf((g) => {
        g.layers.push({ id: 'empty', name: '空の層', match: ['src/未使用/**'] })
        delete g.nodes[0]!.layer
      }),
    )

    for (const key of vm.layerKeys) expect(vm.nodesByLayer.get(key)).toBeDefined()
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

describe('被依存数の降順（US-10）', () => {
  it('多い順に並ぶ', () => {
    const vm = buildViewModel(graphOf())
    const sorted = vm.nodesByFanInDesc('file')

    expect(sorted[0]?.id).toBe('file:src/domain/Todo.ts')
    expect(sorted).toHaveLength(vm.nodes.file.length)
  })

  it('**同数のときの並びは正本 JSON の並び**（消費側で規則がばらつかない）', () => {
    const vm = buildViewModel(graphOf())
    const zero = vm.nodesByFanInDesc('file').filter((n) => vm.fanInOf(n.id, 'file') === 0)
    const original = vm.nodes.file.filter((n) => vm.fanInOf(n.id, 'file') === 0)

    expect(zero.map((n) => n.id)).toEqual(original.map((n) => n.id))
  })

  it('粒度ごとに独立して並べる', () => {
    const vm = buildViewModel(graphOf())

    expect(vm.nodesByFanInDesc('method')).toHaveLength(60)
    // 粒度を指定した結果は MethodNode に絞られるため、kind の絞り直しが要らない
    expect(vm.nodesByFanInDesc('method').every((n) => n.parent.startsWith('file:'))).toBe(true)
    expect(vm.nodesByFanInDesc('file').every((n) => n.path.endsWith('.ts'))).toBe(true)
  })
})

describe('粒度を状態として持つ側からの呼び出し（UT-05）', () => {
  // UT-05 は現在の粒度を状態として持つ。リテラルではなく `Granularity` 型の
  // 変数で渡す経路がコンパイルできることを、実際に呼んで固定する
  const eachGranularity = (vm: ViewModel, granularity: Granularity) => ({
    found: vm.findByQuery('Todo', granularity),
    sorted: vm.nodesByFanInDesc(granularity),
    dependents: vm.dependentNodesOf(vm.nodes[granularity][0]!.id, granularity),
  })

  it.each<Granularity>(['file', 'method'])('%s 粒度を変数で渡せる', (granularity) => {
    const vm = buildViewModel(graphOf())
    const result = eachGranularity(vm, granularity)

    expect(result.sorted).toHaveLength(vm.nodes[granularity].length)
    expect(result.found.length).toBeGreaterThan(0)
    expect(Array.isArray(result.dependents)).toBe(true)
  })
})

describe('メソッドを持たないファイル', () => {
  /** メソッドノードを一切持たないグラフ */
  const withoutMethods = () =>
    graphOf((g) => {
      g.nodes = g.nodes.filter((n) => n.kind === 'file')
      g.edges = g.edges.filter((e) => e.granularity === 'file')
      g.cycles = []
      g.unresolved = []
    })

  it('空のバケットを持つ（undefined にしない）', () => {
    const vm = buildViewModel(withoutMethods())

    for (const file of vm.nodes.file) expect(vm.methodsOfFile.get(file.id)).toEqual([])
  })

  it('すべてのファイルがバケットを持つ', () => {
    const vm = buildViewModel(graphOf())

    expect(vm.nodes.file.every((f) => vm.methodsOfFile.has(f.id))).toBe(true)
  })

  it('キーの並びは正本 JSON のファイル順ではない', () => {
    // メソッドを持たないファイルが先頭にあっても、キーとしては末尾へ回る。
    // 並び順が要るときは nodes.file を回すこと
    const vm = buildViewModel(
      graphOf((g) => {
        g.nodes.unshift({
          id: 'file:src/empty.ts',
          kind: 'file',
          name: 'empty.ts',
          path: 'src/empty.ts',
        })
      }),
    )

    expect(vm.nodes.file[0]!.id).toBe('file:src/empty.ts')
    expect([...vm.methodsOfFile.keys()].at(-1)).toBe('file:src/empty.ts')
  })
})
describe('層の定義の引き当て', () => {
  it('層のキーから名前と glob を引ける', () => {
    const layer = buildViewModel(graphOf()).layerOfKey('domain')

    expect(layer?.name).toBe('Domain')
    expect(layer?.match).toEqual(['src/domain/**'])
  })

  it('ノードが 1 件も属していない層でも引ける', () => {
    const vm = buildViewModel(
      graphOf((g) => {
        g.layers.push({ id: 'empty', name: 'Empty', match: ['src/empty/**'] })
      }),
    )

    expect(vm.nodesByLayer.get('empty')).toEqual([])
    expect(vm.layerOfKey('empty')?.name).toBe('Empty')
  })

  it('NO_LAYER は定義を持たない', () => {
    expect(buildViewModel(graphOf()).layerOfKey(NO_LAYER)).toBeUndefined()
  })

  it('layerKeys のすべてから定義か undefined が引ける', () => {
    const vm = buildViewModel(graphOf())

    for (const key of vm.layerKeys) {
      if (key === NO_LAYER) expect(vm.layerOfKey(key)).toBeUndefined()
      else expect(vm.layerOfKey(key)).toBeDefined()
    }
  })
})
