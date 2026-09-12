import { describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { narrowedNodeIds } from './narrowing'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

const narrow = (selectedNodeId: string | undefined, granularity: 'file' | 'method' = 'file') =>
  narrowedNodeIds({
    nodes: viewModel.nodes[granularity],
    edges: viewModel.edges[granularity],
    selectedNodeId,
  })

describe('選択による絞り込み（US-12）', () => {
  it('選択が無ければ絞らない。0 件とは区別する', () => {
    expect(narrow(undefined)).toBeUndefined()
  })

  it('選んだノードと、その直接の相手だけが残る', () => {
    const target = viewModel.nodes.file.find(
      (node) => viewModel.dependenciesOf(node.id, 'file').length > 0,
    )!
    const kept = narrow(target.id)!

    expect(kept.has(target.id)).toBe(true)
    expect(kept.size).toBeLessThan(viewModel.nodes.file.length)

    for (const id of kept) {
      if (id === target.id) continue
      const touching = viewModel.edges.file.some(
        (edge) =>
          (edge.from === target.id && edge.to === id) ||
          (edge.to === target.id && edge.from === id),
      )
      expect(touching, id).toBe(true)
    }
  })

  it('依存元の向きにも残る（US-14）', () => {
    const used = viewModel.nodes.file.find((node) => viewModel.fanInOf(node.id, 'file') > 0)!
    const kept = narrow(used.id)!

    const dependents = viewModel.dependentNodesOf(used.id, 'file')
    expect(dependents.length).toBeGreaterThan(0)
    for (const node of dependents) expect(kept.has(node.id)).toBe(true)
  })

  it('依存先の向きにも残る（US-15）', () => {
    const uses = viewModel.nodes.file.find(
      (node) => viewModel.dependenciesOf(node.id, 'file').length > 0,
    )!
    const kept = narrow(uses.id)!

    for (const dependency of viewModel.dependenciesOf(uses.id, 'file')) {
      expect(kept.has(dependency.node.id)).toBe(true)
    }
  })

  it('2 段先は残らない。たどっても範囲は広がらない', () => {
    const target = viewModel.nodes.file.find((node) => {
      const next = viewModel.dependenciesOf(node.id, 'file')
      return next.some((d) => viewModel.dependenciesOf(d.node.id, 'file').length > 0)
    })!
    const kept = narrow(target.id)!

    const second = viewModel
      .dependenciesOf(target.id, 'file')
      .flatMap((d) => viewModel.dependenciesOf(d.node.id, 'file'))
      .map((d) => d.node.id)
      .filter((id) => !kept.has(id))

    expect(second.length).toBeGreaterThan(0)
  })

  it('メソッド粒度でも成立する', () => {
    const target = viewModel.nodes.method.find(
      (node) => viewModel.dependenciesOf(node.id, 'method').length > 0,
    )!
    const kept = narrow(target.id, 'method')!

    expect(kept.has(target.id)).toBe(true)
    expect(kept.size).toBeLessThan(viewModel.nodes.method.length)
  })

  it('粒度に無いノードを選んでいるときは絞らない', () => {
    expect(narrow(viewModel.nodes.method[0]!.id, 'file')).toBeUndefined()
  })
})
