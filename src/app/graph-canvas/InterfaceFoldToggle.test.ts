// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import InterfaceFoldToggle from './InterfaceFoldToggle.vue'
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

function setup(
  options: { granularity?: 'file' | 'method'; reading?: 'interface' | 'implementation' } = {},
) {
  const state = useViewState()
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  state.setGranularity(options.granularity ?? 'method')
  state.viaReading = options.reading ?? 'implementation'

  return { state, wrapper: mount(InterfaceFoldToggle) }
}

describe('インターフェースを畳む切り替え（UT-29 / UT-30 の後段）', () => {
  it('実装宛で読んでいるメソッド粒度では、押して畳める', async () => {
    const { state, wrapper } = setup()

    await wrapper.get('button').trigger('click')
    expect(state.interfacesFolded).toBe(true)

    await wrapper.get('button').trigger('click')
    expect(state.interfacesFolded).toBe(false)
  })

  it('いま畳んでいるかを、押下状態で読み上げに出す', async () => {
    const { wrapper } = setup()
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')

    await wrapper.get('button').trigger('click')

    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
  })

  it('インターフェース宛で読んでいるときは押せない', () => {
    /*
     * その読み方では線が interface を通っている。畳むと**呼び出しの事実
     * そのもの**が図から消える
     */
    const { wrapper } = setup({ reading: 'interface' })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('ファイル粒度でも押せない', () => {
    // その粒度の import は実際の依存で、畳む対象が無い
    const { wrapper } = setup({ granularity: 'file' })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it.each([
    ['読み方', { reading: 'interface' as const }, '経由の行き先'],
    ['粒度', { granularity: 'file' as const }, 'メソッド粒度'],
  ])('%s で効かないときは、その理由が画面から読める', (_label, options, expected) => {
    // 押せない口には焦点が当たらない。ポインタのツールチップだけにしない
    const { wrapper } = setup(options)

    const describedBy = wrapper.get('button').attributes('aria-describedby')
    expect(describedBy).toBeDefined()
    expect(wrapper.get(`[id="${describedBy}"]`).text()).toContain(expected)
  })

  it('効くときは、余計な断りを付けない', () => {
    const { wrapper } = setup()

    expect(wrapper.get('button').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.text()).not.toContain('使えます')
  })

  it('良し悪しを出さない（N-1）', () => {
    const { wrapper } = setup()

    for (const word of ['違反', '警告', '問題', '多い', '不要']) {
      expect(wrapper.text()).not.toContain(word)
    }
  })
})
