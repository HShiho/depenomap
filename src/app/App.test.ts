// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import App from './App.vue'
import { useViewState } from './shell/view-state'

import fixture from '../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

beforeEach(() => setActivePinia(createPinia()))

function setup() {
  const state = useViewState()
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  return { state, wrapper: mount(App) }
}

/**
 * 読み上げ名でボタンを探す。**どこにあるかまで指定する** — 畳む口は面と
 * レールの 2 か所にあり、名前だけで探すと片方しか触っていないのに通る
 */
function buttonWithLabel(
  wrapper: ReturnType<typeof setup>['wrapper'],
  within: string,
  label: string,
) {
  return wrapper
    .findAll(`${within} button`)
    .find((button) => button.attributes('aria-label') === label)
}

describe('一覧の折りたたみ（US-08）', () => {
  it('一覧の中から畳める。畳むとキャンバスが広がる', async () => {
    const { state, wrapper } = setup()
    expect(wrapper.find('.shell').attributes('data-panel')).toBe('open')

    await buttonWithLabel(wrapper, '.shell-panel', '一覧を閉じる')!.trigger('click')

    expect(state.sidebarOpen).toBe(false)
    expect(wrapper.find('.shell').attributes('data-panel')).toBe('closed')
  })

  it('畳んだあとも、画面の端から開き直せる', async () => {
    // 畳むと面ごと見えなくなるので、開き直す口は面の外に要る
    const { state, wrapper } = setup()
    await buttonWithLabel(wrapper, '.shell-panel', '一覧を閉じる')!.trigger('click')

    const reopen = buttonWithLabel(wrapper, '.shell-rail', '一覧を開く')
    expect(reopen).toBeDefined()
    await reopen!.trigger('click')

    expect(state.sidebarOpen).toBe(true)
    expect(wrapper.find('.shell').attributes('data-panel')).toBe('open')
  })

  it('畳んでいるあいだ、一覧は操作できない', async () => {
    const { wrapper } = setup()
    await buttonWithLabel(wrapper, '.shell-panel', '一覧を閉じる')!.trigger('click')

    expect(wrapper.find('.shell-panel').attributes('inert')).toBeDefined()
  })
})
