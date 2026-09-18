// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as v from 'valibot'
import { beforeEach, describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '@/core/graph/schema'
import { buildViewModel } from '@/core/ir/view-model'
import TopDependedFiles from './TopDependedFiles.vue'
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
  return { state, viewModel, wrapper: mount(TopDependedFiles) }
}

const idsOf = (wrapper: ReturnType<typeof setup>['wrapper']) =>
  wrapper.findAll('[data-node-id]').map((row) => row.attributes('data-node-id')!)

describe('被依存数の多いファイル（US-11）', () => {
  it('被依存数の降順に、上位 8 件を出す', () => {
    const { viewModel, wrapper } = setup()

    expect(idsOf(wrapper)).toEqual(
      viewModel
        .nodesByFanInDesc('file')
        .slice(0, 8)
        .map((node) => node.id),
    )
  })

  it('並びは IR のもの。ここで数え直さない', () => {
    const { viewModel, wrapper } = setup()
    const counts = idsOf(wrapper).map((id) => viewModel.fanInOf(id, 'file'))

    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('出している数が、サイドバーと同じ被依存数', () => {
    // 数え方が違うと、同じファイルに 2 つの数が出る
    const { viewModel, wrapper } = setup()
    const top = viewModel.nodesByFanInDesc('file')[0]!

    expect(wrapper.text()).toContain(String(viewModel.fanInOf(top.id, 'file')))
  })

  it('どの層から使われているかの内訳を出す', () => {
    const { viewModel, wrapper } = setup()
    const top = viewModel.nodesByFanInDesc('file')[0]!
    const byLayer = viewModel.fanInByLayerOf(top.id, 'file')

    const titles = wrapper
      .findAll('i[title]')
      .map((part) => part.attributes('title')!)
      .filter((title) => title.startsWith(top.name))
    expect(titles).toHaveLength(byLayer.size)
    expect(titles.join(' ')).toContain('から')
  })

  it('行を押すと、そのファイルへ移る合図を出す', () => {
    // 移動そのものは UT-14 の経路。ここは導線を差し込むだけ
    const { viewModel, wrapper } = setup()
    const top = viewModel.nodesByFanInDesc('file')[0]!

    wrapper.find(`[data-node-id="${top.id}"]`).trigger('click')

    expect(wrapper.emitted('move')).toEqual([[top.id]])
  })

  it('ファイルが 8 件より少なくても、あるぶんを出す', () => {
    // 上限だけを見ると、1 行も出なくなっても気付けない
    const { wrapper } = setup((g) => {
      const keep = g.nodes.filter((node) => node.kind === 'file').slice(0, 3)
      const ids = new Set(keep.map((node) => node.id))
      g.nodes = keep
      g.edges = g.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to))
      g.cycles = []
      g.unresolved = []
    })

    expect(idsOf(wrapper)).toHaveLength(3)
  })

  it('多いことを問題として扱わない（N-1）', () => {
    const { wrapper } = setup()

    for (const word of ['多すぎ', '警告', '違反', '問題', '目安', '推奨']) {
      expect(wrapper.text()).not.toContain(word)
    }
  })
})
