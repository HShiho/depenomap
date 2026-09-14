import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '@/core/graph/schema'
import { buildViewModel } from '@/core/ir/view-model'
import { cycleMarkOf, isCycleEdge } from './cycle-mark'

import fixture from '../../../test-data/dependency-graph.complex.json'

function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}
const vmOf = (mutate?: (g: DependencyGraph) => void) => buildViewModel(graphOf(mutate))
const viewModel = vmOf()

/** 型のみの循環（`c_0001`）に含まれるノード */
const typeOnlyNode = 'file:src/domain/Todo.ts'
/** 型のみでない循環（`c_0003`）に含まれるノード */
const plainNode = 'file:src/usecase/ListTodos.ts'
/** `typeOnly` を持たない循環（メソッド粒度） */
const methodNode = 'method:src/usecase/ListTodos.ts#ListTodos.execute'

describe('循環の印（US-06）', () => {
  it('循環に含まれないノードには印を出さない', () => {
    expect(cycleMarkOf(viewModel, 'file:src/di/container.ts')).toBeUndefined()
  })

  it('循環に含まれるノードに印を出す', () => {
    expect(cycleMarkOf(viewModel, plainNode)).toBe('循環')
  })

  it('型のみの循環には、そのことを添える', () => {
    expect(cycleMarkOf(viewModel, typeOnlyNode)).toBe('循環（型のみ）')
  })

  it('typeOnly を持たない循環には何も添えない', () => {
    // メソッド粒度の循環にはフィールドごと無い。「型のみではない」と
    // 読み替えて断定しない（N-1）
    expect(cycleMarkOf(viewModel, methodNode)).toBe('循環')
  })

  it('型のみでない循環にも何も添えない', () => {
    expect(cycleMarkOf(viewModel, plainNode)).not.toContain('型')
  })

  it('型のみとそうでない循環の両方に属するなら、添えない', () => {
    // 片方だけを根拠に「型のみ」と出すと、もう片方の循環を型のみだと読ませる
    const model = vmOf((g) => {
      g.cycles[2]!.nodes = [...g.cycles[2]!.nodes, typeOnlyNode]
    })

    expect(model.cyclesOf(typeOnlyNode)).toHaveLength(2)
    expect(cycleMarkOf(model, typeOnlyNode)).toBe('循環')
  })

  it('是正や深刻度を示す言葉を出さない（N-1）', () => {
    const marks = [...viewModel.nodes.file, ...viewModel.nodes.method]
      .map((node) => cycleMarkOf(viewModel, node.id))
      .filter((mark): mark is string => mark !== undefined)

    expect(marks.length).toBeGreaterThan(0)
    for (const word of ['警告', 'エラー', '違反', '重大', '注意', '修正', '解消']) {
      expect(marks.join(' ')).not.toContain(word)
    }
  })

  it('循環に含まれるエッジが分かる', () => {
    const cycle = viewModel.cyclesOf(plainNode)[0]!

    for (const edgeId of cycle.edges) {
      expect(isCycleEdge(viewModel, edgeId)).toBe(true)
    }
  })

  it('循環に含まれないエッジは偽', () => {
    const inCycle = new Set(
      viewModel.nodes.file.flatMap((n) => viewModel.cyclesOf(n.id)).flatMap((c) => c.edges),
    )
    const outside = viewModel.edges.file.find((edge) => !inCycle.has(edge.id))!

    expect(isCycleEdge(viewModel, outside.id)).toBe(false)
  })

  it('循環が 1 件も無くても壊れない', () => {
    const model = vmOf((g) => {
      g.cycles = []
    })

    expect(cycleMarkOf(model, typeOnlyNode)).toBeUndefined()
    expect(isCycleEdge(model, model.edges.file[0]!.id)).toBe(false)
  })
})
