// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as v from 'valibot'
import { beforeEach, describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '@/core/graph/schema'
import { buildViewModel } from '@/core/ir/view-model'
import UnresolvedSheet from './UnresolvedSheet.vue'
import { useViewState } from '../shell/view-state'

import fixture from '../../../test-data/dependency-graph.complex.json'

function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}

beforeEach(() => setActivePinia(createPinia()))

function setup(mutate?: (g: DependencyGraph) => void) {
  const state = useViewState()
  const viewModel = buildViewModel(graphOf(mutate))
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  return { state, viewModel, wrapper: mount(UnresolvedSheet) }
}

describe('追跡できなかった依存の一覧（US-21）', () => {
  it('1 件も無くても破綻しない', () => {
    // 追えなかったものが無いこと自体は、読み手が知りたい事実
    const { wrapper } = setup((g) => {
      g.unresolved = []
    })

    expect(wrapper.findAll('[data-unresolved-id]')).toHaveLength(0)
    expect(wrapper.text()).toContain('追跡できなかった依存はありません')
  })

  it('知らない理由のコードでも、そのまま出す', () => {
    const { wrapper } = setup((g) => {
      g.unresolved[0]!.reason = 'brand-new-reason'
    })

    expect(wrapper.text()).toContain('brand-new-reason')
  })

  it('図に出ていない粒度の呼び出し元でも、名前で出る', () => {
    // 一覧はメソッド粒度の呼び出し元を持つが、図はファイル粒度で開いている
    const { viewModel, wrapper } = setup()
    const first = viewModel.unresolved[0]!

    expect(wrapper.text()).toContain(viewModel.nodeById.get(first.from)!.name)
  })

  it('候補を確定した依存として見せない', () => {
    const { wrapper } = setup()

    for (const word of ['依存先', '呼び出しています', '確定']) {
      expect(wrapper.text()).not.toContain(word)
    }
  })
})
