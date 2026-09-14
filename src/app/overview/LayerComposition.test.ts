// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as v from 'valibot'
import { beforeEach, describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '@/core/graph/schema'
import { buildViewModel } from '@/core/ir/view-model'
import LayerComposition from './LayerComposition.vue'
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
  return { state, viewModel, wrapper: mount(LayerComposition) }
}

/** 帯の区画の名前と件数を、印の説明から取る */
function partsOf(wrapper: ReturnType<typeof setup>['wrapper']) {
  return wrapper.findAll('i[title]').map((part) => {
    const title = part.attributes('title') ?? ''
    return { title, count: Number(/ (\d+) ファイル/.exec(title)?.[1] ?? 0) }
  })
}

describe('層ごとの構成比（US-11）', () => {
  it('層が未設定のファイルも 1 つの区画として出す', () => {
    // 層が無いこと自体は欠陥ではない（ADR-002 / N-1）。落とすと合計が合わなくなる
    const { viewModel, wrapper } = setup((g) => {
      const file = g.nodes.find((node) => node.kind === 'file')!
      delete file.layer
    })
    const parts = partsOf(wrapper)

    expect(parts.some((part) => part.title.startsWith('層なし'))).toBe(true)
    expect(parts.reduce((sum, part) => sum + part.count, 0)).toBe(viewModel.nodes.file.length)
  })

  it('ファイルが 1 件も無くても破綻しない', () => {
    // 母数が 0 でも割合の計算が壊れない（完了条件）
    const { wrapper } = setup((g) => {
      g.nodes = []
      g.edges = []
      g.cycles = []
      g.unresolved = []
    })

    expect(wrapper.text()).toContain('全 0 ファイル')
    for (const part of partsOf(wrapper)) expect(part.title).not.toContain('NaN')
  })

  it('ノードが 1 件も属していない層も落とさない', () => {
    // 層の存在は JSON が権威（ADR-002）。空だから出さないのは表示側の判定になる
    const { viewModel, wrapper } = setup((g) => {
      g.layers.push({ id: 'empty', name: '空の層', match: ['src/nowhere/**'] })
    })

    expect(partsOf(wrapper).some((part) => part.title.startsWith('空の層 0 ファイル'))).toBe(true)
    expect(partsOf(wrapper)).toHaveLength(viewModel.layerKeys.length)
  })

  it('並びは図の列と同じ（`layerKeys` の順）', () => {
    const { viewModel, wrapper } = setup()
    const names = partsOf(wrapper).map((part) => part.title.split(' ')[0])

    expect(names).toEqual(
      viewModel.layerKeys.map((key) => viewModel.layerOfKey(key)?.name ?? '層なし'),
    )
  })

  it('良し悪しを示さない（N-1）', () => {
    const { wrapper } = setup()

    for (const word of ['偏', '多すぎ', '少なすぎ', '望ましい', '理想']) {
      expect(wrapper.text()).not.toContain(word)
    }
  })
})
