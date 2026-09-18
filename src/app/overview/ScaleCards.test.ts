// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as v from 'valibot'
import { beforeEach, describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '@/core/graph/schema'
import { buildViewModel } from '@/core/ir/view-model'
import ScaleCards from './ScaleCards.vue'
import { useViewState } from '../shell/view-state'

import fixture from '../../../test-data/dependency-graph.complex.json'

function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}

beforeEach(() => setActivePinia(createPinia()))

function setup(mutate?: (g: DependencyGraph) => void) {
  const graph = graphOf(mutate)
  const state = useViewState()
  const viewModel = buildViewModel(graph)
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  return { graph, viewModel, wrapper: mount(ScaleCards) }
}

/** カードの見出しと数 */
function cardsOf(wrapper: ReturnType<typeof setup>['wrapper']) {
  return Object.fromEntries(
    wrapper.findAll('li').map((card) => {
      const [count, label] = card.findAll('div')
      return [label?.text() ?? '', Number(count?.text())]
    }),
  )
}

describe('規模（US-11）', () => {
  it('ファイル数・メソッド数・依存の本数を出す', () => {
    const { viewModel, wrapper } = setup()
    const cards = cardsOf(wrapper)

    expect(cards['ファイル']).toBe(viewModel.nodes.file.length)
    expect(cards['メソッド']).toBe(viewModel.nodes.method.length)
    expect(cards['ファイル間の依存']).toBe(viewModel.edges.file.length)
  })

  it('層は、正本 JSON が定義した数を出す', () => {
    const { graph, wrapper } = setup()

    expect(cardsOf(wrapper)['層']).toBe(graph.layers.length)
  })

  it('層が未設定のノードがあっても、層の数が増えない', () => {
    // 「層なし」はビューアが受け皿として作った分類で、定義された層ではない（ADR-002）
    const { graph, wrapper } = setup((g) => {
      const file = g.nodes.find((node) => node.kind === 'file')!
      delete file.layer
    })

    expect(cardsOf(wrapper)['層']).toBe(graph.layers.length)
  })

  it('ノードが 1 件も無くても壊れない', () => {
    const { wrapper } = setup((g) => {
      g.nodes = []
      g.edges = []
      g.cycles = []
      g.unresolved = []
    })

    expect(cardsOf(wrapper)['ファイル']).toBe(0)
  })

  it('数に良し悪しを付けない（N-1）', () => {
    const { wrapper } = setup()

    for (const word of ['多すぎ', '少なすぎ', '目安', '推奨', '警告']) {
      expect(wrapper.text()).not.toContain(word)
    }
  })
})
