// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import App from './App.vue'
import { useViewState } from './shell/view-state'

import fixture from '../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

/**
 * 画面を出す。
 *
 * **状態を先に仕込むだけでは足りない。** `App` は `onMounted` で読み込みを
 * 始め、最初の `await` より前に `applyLoadOutcome({ kind: 'loading' })` を
 * 走らせるため、仕込んだグラフはマウントの時点で消える。取りに行く先を
 * 差し替えて、`ready` に落ち着かせてから触る。
 */
async function setup() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(result)))),
  )

  const state = useViewState()
  const wrapper = mount(App)
  await vi.waitUntil(() => state.status.kind === 'ready')
  await wrapper.vm.$nextTick()

  return { state, wrapper }
}

/**
 * 読み上げ名でボタンを探す。**どこにあるかまで指定する** — 畳む口は面と
 * レールの 2 か所にあり、名前だけで探すと片方しか触っていないのに通る
 */
function buttonWithLabel(
  wrapper: Awaited<ReturnType<typeof setup>>['wrapper'],
  within: string,
  label: string,
) {
  return wrapper
    .findAll(`${within} button`)
    .find((button) => button.attributes('aria-label') === label)
}

describe('一覧の折りたたみ（US-08）', () => {
  it('一覧の中から畳める。畳むとキャンバスが広がる', async () => {
    const { state, wrapper } = await setup()
    // 前提の確認。ここが 0 件だと、以降は空の一覧を畳んでいるだけになる
    expect(wrapper.findAll('.shell-panel [data-node-id]').length).toBeGreaterThan(0)
    expect(wrapper.find('.shell').attributes('data-panel')).toBe('open')

    await buttonWithLabel(wrapper, '.shell-panel', '一覧を閉じる')!.trigger('click')

    expect(state.sidebarOpen).toBe(false)
    expect(wrapper.find('.shell').attributes('data-panel')).toBe('closed')
  })

  it('畳んだあとも、画面の端から開き直せる', async () => {
    // 畳むと面ごと見えなくなるので、開き直す口は面の外に要る
    const { state, wrapper } = await setup()
    await buttonWithLabel(wrapper, '.shell-panel', '一覧を閉じる')!.trigger('click')

    const reopen = buttonWithLabel(wrapper, '.shell-rail', '一覧を開く')
    expect(reopen).toBeDefined()
    await reopen!.trigger('click')

    expect(state.sidebarOpen).toBe(true)
    expect(wrapper.find('.shell').attributes('data-panel')).toBe('open')
  })

  it('畳んでいるあいだ、一覧は操作できない', async () => {
    const { wrapper } = await setup()
    await buttonWithLabel(wrapper, '.shell-panel', '一覧を閉じる')!.trigger('click')

    expect(wrapper.find('.shell-panel').attributes('inert')).toBeDefined()
  })
})

describe('検索の効き方（UT-11）', () => {
  it('検索してもノードマップは絞られない', async () => {
    /*
     * 図の絞り込みは選択が持つ（UT-14 / US-12）。検索でも絞ると、絞り込みの
     * 根拠が 2 つに分かれ、両方が効いているときの規則を決めることになる
     */
    const { wrapper } = await setup()
    const before = wrapper.findAll('svg g.node').length
    expect(before).toBeGreaterThan(0)

    await wrapper.find('input[type="search"]').setValue('Todo')

    expect(wrapper.findAll('svg g.node').length).toBe(before)
  })

  it('検索結果の行からノードへ行く経路は、一覧の行と同じ', async () => {
    // 検索専用の移動経路を作らない（ADR-003 の実装方針）
    const { state, wrapper } = await setup()
    const rowsOf = () => wrapper.findAll('.shell-panel [data-node-id]')
    const before = rowsOf().length

    await wrapper.find('input[type="search"]').setValue('Todo')

    // 押す行が検索結果であること自体を前提として確かめる。
    // ここを見ないと、検索欄が何もしなくてもこの検査は通る
    expect(rowsOf().length).toBeLessThan(before)

    const row = rowsOf()[0]!
    const id = row.attributes('data-node-id')!
    expect(id.toLowerCase()).toContain('todo')

    await row.trigger('click')
    expect(state.selectedNodeId).toBe(id)
    expect(state.history.at(-1)?.nodeId).toBe(id)
  })
})
