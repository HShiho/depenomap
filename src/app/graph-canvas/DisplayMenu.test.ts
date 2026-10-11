// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import DisplayMenu from './DisplayMenu.vue'
import { useViewState } from '../shell/view-state'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

enableAutoUnmount(afterEach)

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function setup() {
  const state = useViewState()
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  state.setCompositionRootLayer('di')
  const wrapper = mount(DisplayMenu, { attachTo: document.body })
  return { state, wrapper }
}

const trigger = (wrapper: ReturnType<typeof setup>['wrapper']) =>
  wrapper.get('button[aria-haspopup]')
const panel = (wrapper: ReturnType<typeof setup>['wrapper']) => wrapper.get('[data-display-panel]')

describe('表示メニュー（UT-31 / ツールバーの幅）', () => {
  it('既定は閉じている', () => {
    const { wrapper } = setup()

    expect(panel(wrapper).isVisible()).toBe(false)
    expect(trigger(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('押すと開き、もう一度押すと閉じる', async () => {
    const { wrapper } = setup()

    await trigger(wrapper).trigger('click')
    expect(panel(wrapper).isVisible()).toBe(true)
    expect(trigger(wrapper).attributes('aria-expanded')).toBe('true')

    await trigger(wrapper).trigger('click')
    expect(panel(wrapper).isVisible()).toBe(false)
  })

  it('見え方の切り替え 3 つを中に持つ', async () => {
    const { wrapper } = setup()
    await trigger(wrapper).trigger('click')

    const text = panel(wrapper).text()
    expect(text).toContain('経由の行き先')
    expect(text).toContain('interface を畳む')
    expect(text).toContain('合成ルート')
  })

  it('中の切り替えを押しても閉じない（続けて切り替えられる）', async () => {
    const { state, wrapper } = setup()
    await trigger(wrapper).trigger('click')

    const toggle = panel(wrapper)
      .findAll('button')
      .find((button) => button.text().includes('合成ルート'))!
    await toggle.trigger('click')

    expect(state.compositionRootHidden).toBe(true)
    expect(panel(wrapper).isVisible()).toBe(true)
  })

  it('Esc で閉じ、焦点を開いた口へ返す。下の Esc（絞り込みを解く）へは渡さない', async () => {
    const { wrapper } = setup()
    await trigger(wrapper).trigger('click')
    let reachedBelow = false
    const below = () => (reachedBelow = true)
    window.addEventListener('keydown', below)

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    window.removeEventListener('keydown', below)

    expect(panel(wrapper).isVisible()).toBe(false)
    expect(reachedBelow).toBe(false)
    expect(document.activeElement).toBe(trigger(wrapper).element)
  })

  it('閉じているときの Esc は下へ渡す', async () => {
    setup()
    let reachedBelow = false
    const below = () => (reachedBelow = true)
    window.addEventListener('keydown', below)

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    window.removeEventListener('keydown', below)

    expect(reachedBelow).toBe(true)
  })

  it('外側を押すと閉じる', async () => {
    const { wrapper } = setup()
    await trigger(wrapper).trigger('click')

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(panel(wrapper).isVisible()).toBe(false)
  })

  it('既定と違う見え方になっていることが、閉じたままでも分かる', async () => {
    // 隠す・畳む・実装宛を選んだまま閉じると、何が効いているのかが口から読めない
    const { state, wrapper } = setup()
    expect(trigger(wrapper).find('[data-display-changed]').exists()).toBe(false)

    state.setCompositionRootHidden(true)
    await wrapper.vm.$nextTick()

    expect(trigger(wrapper).find('[data-display-changed]').exists()).toBe(true)
    expect(trigger(wrapper).attributes('aria-label')).toContain('既定から変更')
  })
})
