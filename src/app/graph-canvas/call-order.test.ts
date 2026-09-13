import { describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import type { GraphEdge, GraphNode } from '@/core/graph/schema'
import { callOrderKeys } from './call-order'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

/** 呼び出しを 2 本以上持つメソッド。順序が効く題材 */
const caller = viewModel.nodes.method.find(
  (node) =>
    viewModel.edges.method.filter(
      (edge) => edge.from === node.id && (edge.kind === 'call' || edge.kind === 'construct'),
    ).length > 1,
)!

const keysFor = (selectedNodeId: string, granularity: 'file' | 'method' = 'method') =>
  callOrderKeys({ edges: viewModel.edges[granularity], selectedNodeId })

/** 組み合わせを狙って作れないものは、エッジを手で組んで確かめる */
const call = (to: string, sourceOrder: number): GraphEdge => ({
  id: `call:${to}`,
  from: 'c',
  to,
  kind: 'call',
  granularity: 'method',
  resolution: 'static',
  sourceOrder,
})

const importing = (to: string): GraphEdge => ({
  id: `import:${to}`,
  from: 'c',
  to,
  kind: 'import',
  granularity: 'file',
  importKind: 'value',
  specifier: './x',
})

const node = (id: string) => ({ id }) as GraphNode

describe('呼び出し順の並び（US-05）', () => {
  it('依存先が sourceOrder の昇順に並ぶ', () => {
    const keyOf = keysFor(caller.id)
    const calls = viewModel.edges.method
      .filter(
        (edge) => edge.from === caller.id && (edge.kind === 'call' || edge.kind === 'construct'),
      )
      .map((edge) => ({ to: edge.to, order: 'sourceOrder' in edge ? edge.sourceOrder : 0 }))

    expect(calls.length).toBeGreaterThan(1)
    const sorted = [...calls].sort((a, b) => a.order - b.order)
    const byKey = [...calls].sort((a, b) =>
      (keyOf(viewModel.nodeById.get(a.to)!) ?? '').localeCompare(
        keyOf(viewModel.nodeById.get(b.to)!) ?? '',
      ),
    )

    expect(byKey.map((entry) => entry.to)).toEqual(sorted.map((entry) => entry.to))
  })

  it('選択そのものは、自分の列の先頭に来る', () => {
    const keyOf = keysFor(caller.id)
    const other = viewModel.edges.method.find((edge) => edge.from === caller.id)!.to

    const centre = keyOf(viewModel.nodeById.get(caller.id)!)!
    const neighbour = keyOf(viewModel.nodeById.get(other)!)!
    expect(centre.localeCompare(neighbour)).toBeLessThan(0)
  })

  it('順序を持たないエッジの相手は、持つものの後ろへ置く', () => {
    // `sourceOrder` は call / construct にしか無い。ここで順序を捏造しない
    const file = viewModel.nodes.file.find((node) =>
      viewModel.edges.file.some((edge) => edge.from === node.id && edge.kind === 'import'),
    )!
    const keyOf = keysFor(file.id, 'file')
    const imported = viewModel.edges.file.find(
      (edge) => edge.from === file.id && edge.kind === 'import',
    )!.to

    expect(keyOf(viewModel.nodeById.get(imported)!)!.startsWith('2:')).toBe(true)
  })

  it('同じ並びを何度作っても変わらない', () => {
    const first = keysFor(caller.id)
    const second = keysFor(caller.id)

    for (const node of viewModel.nodes.method) {
      expect(second(node)).toBe(first(node))
    }
  })

  it('選択と繋がらないノードには、キーを与えない', () => {
    // 絞り込みの外では呼び出し順という概念が無い。呼ぶ側が既定の並びへ落とす
    const keyOf = keysFor(caller.id)
    const unrelated = viewModel.nodes.method.find(
      (node) =>
        node.id !== caller.id &&
        !viewModel.edges.method.some(
          (edge) =>
            (edge.from === caller.id && edge.to === node.id) ||
            (edge.to === caller.id && edge.from === node.id),
        ),
    )!

    expect(keyOf(unrelated)).toBeUndefined()
  })

  it('同じ sourceOrder を持つ相手は、同じキーになる', () => {
    // 並びは呼ぶ側の安定ソートに委ねる。ここで番号以外の差を作ると、
    // 正本 JSON が持たない優劣を持ち込むことになる（C-7 / N-1）
    const keyOf = callOrderKeys({
      edges: [call('a', 3), call('b', 3)],
      selectedNodeId: 'c',
    })

    expect(keyOf(node('a'))).toBe(keyOf(node('b')))
  })

  it('順序を持たないエッジが先に来ていても、持つものの後ろへ回る', () => {
    // 正本 JSON の並びは kind で揃っていない。エッジの出現位置に引きずられると、
    // sourceOrder の昇順（US-05）が崩れる
    const keyOf = callOrderKeys({
      edges: [importing('a'), call('b', 9), call('d', 1)],
      selectedNodeId: 'c',
    })
    const sorted = ['a', 'b', 'd'].sort((x, y) => keyOf(node(x))!.localeCompare(keyOf(node(y))!))

    expect(sorted).toEqual(['d', 'b', 'a'])
  })

  it('桁の多い sourceOrder でも、文字列比較が数の大小と一致する', () => {
    // キーは文字列として比べる。桁を揃えないと 10 が 9 より前に来る
    const keyOf = callOrderKeys({
      edges: [call('a', 9), call('b', 10)],
      selectedNodeId: 'c',
    })

    expect(keyOf(node('a'))!.localeCompare(keyOf(node('b'))!)).toBeLessThan(0)
  })

  it('ファイル粒度でも成立する', () => {
    const file = viewModel.nodes.file[2]!
    const keyOf = keysFor(file.id, 'file')

    expect(keyOf(file)).toBe('0')
    const neighbour = viewModel.edges.file.find((edge) => edge.from === file.id)!.to
    expect(keyOf(viewModel.nodeById.get(neighbour)!)).toBeDefined()
  })
})
