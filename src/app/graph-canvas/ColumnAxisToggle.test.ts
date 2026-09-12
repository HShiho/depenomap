// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createApp, h } from 'vue'

import { useViewState } from '../shell/view-state'
import ColumnAxisToggle from './ColumnAxisToggle.vue'
import GranularityToggle from './GranularityToggle.vue'

beforeEach(() => setActivePinia(createPinia()))

describe('並べ方の切り替え（US-04）', () => {
  it('既定は層。いまの軸を押された状態で示す', () => {
    const wrapper = mount(ColumnAxisToggle)
    const buttons = wrapper.findAll('button')

    expect(buttons.map((button) => button.text())).toEqual(['層', '深度'])
    expect(buttons.map((button) => button.attributes('aria-pressed'))).toEqual(['true', 'false'])
  })

  it('押すと器の軸が変わる', async () => {
    const state = useViewState()
    const wrapper = mount(ColumnAxisToggle)

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(state.columnAxis).toBe('depth')
    expect(wrapper.findAll('button')[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('器の側で変わっても表示が追う', async () => {
    const state = useViewState()
    const wrapper = mount(ColumnAxisToggle)

    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('button')[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('粒度を切り替えても軸は保たれる', async () => {
    const state = useViewState()
    const wrapper = mount(ColumnAxisToggle)

    await wrapper.findAll('button')[1]!.trigger('click')
    state.setGranularity('method')
    await wrapper.vm.$nextTick()

    expect(state.columnAxis).toBe('depth')
    expect(wrapper.findAll('button')[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('群に名前が付く。粒度と並べても id が衝突しない', () => {
    // 採番はアプリ単位でやり直されるため、同じアプリに 2 つ置いて見る
    const host = document.createElement('div')
    const app = createApp({ render: () => h('div', [h(GranularityToggle), h(ColumnAxisToggle)]) })
    app.use(createPinia())
    app.mount(host)

    const groups = [...host.querySelectorAll('[role="group"]')]
    const labelIds = groups.map((group) => group.getAttribute('aria-labelledby'))

    expect(labelIds.filter((id) => id !== null)).toHaveLength(2)
    expect(new Set(labelIds).size).toBe(2)
    for (const id of labelIds) expect(host.querySelector(`#${id}`)?.textContent).toBeTruthy()

    app.unmount()
  })
})
