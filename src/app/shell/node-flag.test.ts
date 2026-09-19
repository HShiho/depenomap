import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '@/core/graph/schema'
import { buildViewModel } from '@/core/ir/view-model'
import { nodeFlagOf } from './node-flag'

import fixture from '../../../test-data/dependency-graph.complex.json'

function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}
const vmOf = (mutate?: (g: DependencyGraph) => void) => buildViewModel(graphOf(mutate))
const viewModel = vmOf()

/** 追跡できなかった依存を持つノード */
const withUnresolved = viewModel.unresolved[0]!.from
/** 循環に含まれるファイル */
const inCycle = 'file:src/usecase/ListTodos.ts'

describe('ノードに出す印（UT-10 / UT-19）', () => {
  it('どちらも無ければ、印を出さない', () => {
    const plain = viewModel.nodes.file.find(
      (node) =>
        viewModel.cyclesOf(node.id).length === 0 && viewModel.unresolvedFrom(node.id).length === 0,
    )!

    expect(nodeFlagOf(viewModel, plain.id)).toBeUndefined()
  })

  it('循環だけなら、循環の印', () => {
    expect(nodeFlagOf(viewModel, inCycle)).toBe('循環')
  })

  it('追跡できなかった依存があれば、件数まで出す', () => {
    // どれかは一覧で見る。ここは「ここから先が追えていない」ことまで
    expect(nodeFlagOf(viewModel, withUnresolved)).toContain('未追跡 1')
  })

  it('両方あるときは、どちらも落とさない', () => {
    // 置き場は 1 つしかない。片方を消すと、正本 JSON が言っていることが届かない
    const model = vmOf((g) => {
      g.unresolved.push({
        id: 'u_probe',
        reason: 'callback',
        from: inCycle,
        expression: 'cb()',
        candidates: [],
      })
    })

    const flag = nodeFlagOf(model, inCycle)!
    expect(flag).toContain('循環')
    expect(flag).toContain('未追跡')
  })

  it('件数は、そのノードから追えなかった数', () => {
    const model = vmOf((g) => {
      for (const id of ['u_probe1', 'u_probe2']) {
        g.unresolved.push({
          id,
          reason: 'callback',
          from: inCycle,
          expression: 'cb()',
          candidates: [],
        })
      }
    })

    expect(nodeFlagOf(model, inCycle)).toContain('未追跡 2')
  })

  it('判定を示す言葉を出さない（N-1）', () => {
    const flags = [...viewModel.nodes.file, ...viewModel.nodes.method]
      .map((node) => nodeFlagOf(viewModel, node.id))
      .filter((flag): flag is string => flag !== undefined)

    expect(flags.length).toBeGreaterThan(0)
    for (const word of ['警告', 'エラー', '違反', '要修正', '問題']) {
      expect(flags.join(' ')).not.toContain(word)
    }
  })
})
