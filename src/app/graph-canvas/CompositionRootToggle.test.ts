// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import CompositionRootChip from './CompositionRootChip.vue'
import CompositionRootToggle from './CompositionRootToggle.vue'
import { useViewState } from '../shell/view-state'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)
const diName = result.graph.layers.find((layer) => layer.id === 'di')!.name

enableAutoUnmount(afterEach)

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function ready(layer: string | undefined) {
  const state = useViewState()
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  state.setCompositionRootLayer(layer)
  return state
}

describe('合成ルートを隠す切り替え（UT-31 / ADR-006）', () => {
  it('押すと隠し、もう一度押すと戻す', async () => {
    const state = ready('di')
    const wrapper = mount(CompositionRootToggle)

    await wrapper.get('button').trigger('click')
    expect(state.compositionRootHidden).toBe(true)

    await wrapper.get('button').trigger('click')
    expect(state.compositionRootHidden).toBe(false)
  })

  it('いま隠しているかを、押下状態で読み上げに出す', async () => {
    ready('di')
    const wrapper = mount(CompositionRootToggle)
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')

    await wrapper.get('button').trigger('click')

    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
  })

  it('どの層を隠すのかが読める', () => {
    ready('di')

    expect(mount(CompositionRootToggle).text()).toContain(diName)
  })

  it('層が指定されていなければ、操作そのものを出さない（ADR-006 決定 2）', () => {
    ready(undefined)

    expect(mount(CompositionRootToggle).find('button').exists()).toBe(false)
  })

  it('指定された層がグラフに無ければ、操作を出さない', () => {
    // そのことは描き方の断りが言う
    ready('nowhere')

    expect(mount(CompositionRootToggle).find('button').exists()).toBe(false)
  })
})

describe('合成ルートを隠していることの印（UT-31 / ADR-006 決定 4）', () => {
  it('断りの文面を出す', () => {
    ready('di')
    const wrapper = mount(CompositionRootChip, { props: { note: '合成ルートを隠しています' } })

    expect(wrapper.text()).toContain('合成ルートを隠しています')
  })

  it('戻す口を持つ', async () => {
    const state = ready('di')
    state.setCompositionRootHidden(true)
    const wrapper = mount(CompositionRootChip, { props: { note: '…' } })

    await wrapper.get('button').trigger('click')

    expect(state.compositionRootHidden).toBe(false)
  })

  it('戻す口は、何をするのかが読み上げで分かる', () => {
    ready('di')
    const wrapper = mount(CompositionRootChip, { props: { note: '…' } })

    expect(wrapper.get('button').attributes('aria-label')).toContain('表示')
  })
})
