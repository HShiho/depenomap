import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '../graph/schema'
import { computeDepths, DEPTH_UNDEFINED, findRootOrigins } from './depth'
import { buildViewModel } from './view-model'

const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)
const fixture: unknown = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'))

function vmOf(mutate?: (g: DependencyGraph) => void) {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return buildViewModel(graph)
}

describe('findRootOrigins', () => {
  it('被依存数 0 のノードを起点にする（ADR-001）', () => {
    const vm = vmOf()

    expect(findRootOrigins(vm, 'file')).toHaveLength(4)
    expect(findRootOrigins(vm, 'method')).toHaveLength(23)
  })

  it('起点はどのエッジの to にも現れない', () => {
    const vm = vmOf()
    const used = new Set(vm.edges.file.map((e) => e.to))

    for (const id of findRootOrigins(vm, 'file')) expect(used.has(id)).toBe(false)
  })
})

describe('computeDepths', () => {
  it('起点は深度 0', () => {
    const vm = vmOf()
    const origins = findRootOrigins(vm, 'file')
    const result = computeDepths(vm, 'file', origins)

    for (const id of origins) expect(result.depthOf(id)).toBe(0)
  })

  it('依存の向き（使う側 → 使われる側）にたどる', () => {
    const vm = vmOf()
    const edge = vm.edges.file[0]!
    const result = computeDepths(vm, 'file', [edge.from])

    expect(result.depthOf(edge.from)).toBe(0)
    expect(result.depthOf(edge.to)).toBe(1)
  })

  it('逆向きにはたどらない', () => {
    const vm = vmOf()
    const edge = vm.edges.file[0]!
    const result = computeDepths(vm, 'file', [edge.to])

    expect(result.depthOf(edge.from)).toBe(DEPTH_UNDEFINED)
  })

  it('複数の起点が同時に深度 0 に並ぶ', () => {
    const vm = vmOf()
    const result = computeDepths(vm, 'file', findRootOrigins(vm, 'file'))

    expect(result.origins).toHaveLength(4)
    expect(result.origins.every((id) => result.depthOf(id) === 0)).toBe(true)
  })

  it('選択時は起点が 1 件になる（算出ロジックは共通 / ADR-001）', () => {
    const vm = vmOf()
    const selected = vm.nodes.file[0]!.id
    const result = computeDepths(vm, 'file', [selected])

    expect(result.origins).toEqual([selected])
    expect(result.depthOf(selected)).toBe(0)
  })

  it('最短距離を採る', () => {
    const vm = vmOf()
    const result = computeDepths(vm, 'file', findRootOrigins(vm, 'file'))

    // 幅優先なので、先に到達した深度が最短
    for (const edge of vm.edges.file) {
      const from = result.depthOf(edge.from)
      const to = result.depthOf(edge.to)
      if (typeof from === 'number' && typeof to === 'number')
        expect(to).toBeLessThanOrEqual(from + 1)
    }
  })
})

describe('深度未定', () => {
  it('どの起点からも到達できないノードを区別する', () => {
    const vm = vmOf()
    const result = computeDepths(vm, 'file', [])

    expect(result.unreachable).toHaveLength(28)
    expect(result.depthOf(vm.nodes.file[0]!.id)).toBe(DEPTH_UNDEFINED)
    expect(result.maxDepth).toBeUndefined()
  })

  it('孤立した循環は未定になる（実データ）', () => {
    const vm = vmOf()
    const result = computeDepths(vm, 'method', findRootOrigins(vm, 'method'))

    // c_0005（Todo.attachTo ↔ TodoList.add）は互いに依存し合うだけで、
    // 外から使われていない。どの起点からも到達できない
    expect(result.unreachable).toEqual([
      'method:src/domain/Todo.ts#Todo.attachTo',
      'method:src/domain/TodoList.ts#TodoList.add',
    ])
  })

  it('file 粒度では未定が生じない（実データ）', () => {
    const vm = vmOf()
    const result = computeDepths(vm, 'file', findRootOrigins(vm, 'file'))

    expect(result.unreachable).toEqual([])
    expect(result.maxDepth).toBe(3)
  })

  it('未定は 0 と区別できる', () => {
    const vm = vmOf()
    const result = computeDepths(vm, 'file', [vm.nodes.file[0]!.id])

    expect(result.depthOf(vm.nodes.file[0]!.id)).toBe(0)
    expect(DEPTH_UNDEFINED).not.toBe(0)
  })

  it('到達できたノードと未定のノードで全件になる', () => {
    const vm = vmOf()
    const result = computeDepths(vm, 'file', findRootOrigins(vm, 'file'))
    const reached = vm.nodes.file.filter((n) => result.depthOf(n.id) !== DEPTH_UNDEFINED)

    expect(reached.length + result.unreachable.length).toBe(28)
  })
})

describe('入力の頑健さ', () => {
  it('粒度に存在しない起点は無視する', () => {
    const vm = vmOf()
    const method = vm.nodes.method[0]!.id
    const result = computeDepths(vm, 'file', [method])

    expect(result.origins).toEqual([])
  })

  it('重複した起点を 1 件として扱う', () => {
    const vm = vmOf()
    const id = vm.nodes.file[0]!.id
    const result = computeDepths(vm, 'file', [id, id, id])

    expect(result.origins).toEqual([id])
  })

  it('循環があっても止まる', () => {
    const vm = vmOf()
    const result = computeDepths(vm, 'file', findRootOrigins(vm, 'file'))

    expect(typeof result.maxDepth).toBe('number')
  })
})
