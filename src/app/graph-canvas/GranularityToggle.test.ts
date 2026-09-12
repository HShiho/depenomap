// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'
import GranularityToggle from './GranularityToggle.vue'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

beforeEach(() => setActivePinia(createPinia()))

describe('粒度の切り替え（US-03）', () => {
  it('いまの粒度を押された状態で示す', () => {
    const wrapper = mount(GranularityToggle)
    const buttons = wrapper.findAll('button')

    expect(buttons.map((button) => button.attributes('aria-pressed'))).toEqual(['true', 'false'])
  })

  it('押すと器の粒度が変わる', async () => {
    const state = useViewState()
    const wrapper = mount(GranularityToggle)

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(state.granularity).toBe('method')
    expect(wrapper.findAll('button')[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('器の側で変わっても表示が追う', async () => {
    const state = useViewState()
    const wrapper = mount(GranularityToggle)

    state.setGranularity('method')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('button')[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('切り替えは選択の引き継ぎ規則（UT-05）に従う', async () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const method = viewModel.nodes.method[0]!
    state.select(method.id)
    const wrapper = mount(GranularityToggle)

    // メソッド → ファイルは所属ファイルへ読み替える
    await wrapper.findAll('button')[0]!.trigger('click')

    expect(state.granularity).toBe('file')
    expect(state.selectedNodeId).toBe(method.parent)
  })
})

describe('読み上げ', () => {
  it('ボタン群に名前がある', () => {
    const wrapper = mount(GranularityToggle)
    const group = wrapper.find('[role="group"]')

    expect(group.exists()).toBe(true)
    const labelId = group.attributes('aria-labelledby')!
    expect(wrapper.find(`#${labelId}`).text()).toBe('粒度')
  })

  it('同じ画面に 2 つ置いても id が衝突しない', () => {
    // 別々にマウントすると id の採番がやり直されるため、1 つの画面に 2 つ置く
    const wrapper = mount({
      components: { GranularityToggle },
      template: '<div><GranularityToggle /><GranularityToggle /></div>',
    })

    const ids = wrapper
      .findAll('[role="group"]')
      .map((group) => group.attributes('aria-labelledby'))

    expect(ids).toHaveLength(2)
    expect(ids[0]).toBeTruthy()
    expect(new Set(ids).size).toBe(2)
  })
})
