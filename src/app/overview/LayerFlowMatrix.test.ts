// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as v from 'valibot'
import { beforeEach, describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '@/core/graph/schema'
import { buildViewModel } from '@/core/ir/view-model'
import LayerFlowMatrix from './LayerFlowMatrix.vue'
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
  return { state, viewModel, wrapper: mount(LayerFlowMatrix) }
}

/** 数の入っているセル（対角は除く） */
function cellsOf(wrapper: ReturnType<typeof setup>['wrapper']) {
  return wrapper.findAll('td[title]').map((cell) => ({
    title: cell.attributes('title') ?? '',
    text: cell.text(),
    count: Number(cell.text()),
  }))
}

describe('層をまたぐ依存の流れ（US-11）', () => {
  it('層の組をすべて並べる。対角は数えない', () => {
    const { viewModel, wrapper } = setup()
    const layers = viewModel.layerKeys.length

    expect(cellsOf(wrapper)).toHaveLength(layers * layers - layers)
    expect(wrapper.findAll('[aria-label="同じ層の中"]')).toHaveLength(layers)
  })

  it('セルの合計が、層をまたぐ依存の本数と一致する', () => {
    const { viewModel, wrapper } = setup()
    const cells = cellsOf(wrapper)

    // 0 本も数として出す。空欄にすると「まだ数えていない」と区別が付かない
    expect(cells.every((cell) => cell.text !== '')).toBe(true)
    expect(cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(
      viewModel.layerFlows('file').reduce((sum, flow) => sum + flow.count, 0),
    )
  })

  it('行が呼ぶ側、列が呼ばれる側', () => {
    const { viewModel, wrapper } = setup()
    const flow = viewModel.layerFlows('file')[0]!
    const nameOf = (key: (typeof flow)['from']) => viewModel.layerOfKey(key)?.name ?? '層なし'

    const cell = cellsOf(wrapper).find(
      (found) => found.title === `${nameOf(flow.from)} → ${nameOf(flow.to)} ${flow.count} 本`,
    )

    expect(cell).toBeDefined()
  })

  it('層の並びは「層の構成」と同じ', () => {
    const { viewModel, wrapper } = setup()
    const heads = wrapper
      .findAll('thead th')
      .slice(1)
      .map((head) => head.text())

    expect(heads).toEqual(
      viewModel.layerKeys.map((key) => viewModel.layerOfKey(key)?.name ?? '層なし'),
    )
  })

  it('依存が 1 本も無くても破綻しない', () => {
    const { wrapper } = setup((g) => {
      g.edges = []
      g.cycles = []
    })

    expect(cellsOf(wrapper).every((cell) => cell.count === 0)).toBe(true)
  })

  it('向きの正誤を判定しない（N-1）', () => {
    const { wrapper } = setup()

    for (const word of ['違反', '逆流', '不正', '望ましい', 'あるべき', '警告']) {
      expect(wrapper.text()).not.toContain(word)
    }
  })
})
