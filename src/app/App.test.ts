// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
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

/*
 * 文書へ繋いだ `App` を畳まないと、`window` の `keydown` と DOM が後続テストへ
 * 残る。`press()` は `document.body` へ発火するので、残ったハンドラも毎回走る。
 */
enableAutoUnmount(afterEach)

/**
 * 画面を出す。
 *
 * **状態を先に仕込むだけでは足りない。** `App` は `onMounted` で読み込みを
 * 始め、最初の `await` より前に `applyLoadOutcome({ kind: 'loading' })` を
 * 走らせるため、仕込んだグラフはマウントの時点で消える。取りに行く先を
 * 差し替えて、`ready` に落ち着かせてから触る。
 */
async function setup(options: { attach?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(result)))),
  )

  const state = useViewState()
  const wrapper = mount(App, options.attach === true ? { attachTo: document.body } : {})
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

describe('絞り込みの印と解除（US-12 / UT-14）', () => {
  const chip = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) =>
    wrapper.find('.shell-overlay')

  it('絞っていないときは、印を出さない', async () => {
    const { wrapper } = await setup()

    expect(chip(wrapper).text()).toBe('')
  })

  it('絞ると、何を中心にしているかを出す', async () => {
    // 図から消えたノードは、消えたこと自体が画面から読めない
    const { state, wrapper } = await setup()
    const target = state.viewModel!.nodes.file[2]!

    state.select(target.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    expect(chip(wrapper).text()).toContain(target.name)
    expect(chip(wrapper).text()).toContain('周辺だけを表示中')
  })

  it('印から解ける。選択は残る', async () => {
    const { state, wrapper } = await setup()
    const target = state.viewModel!.nodes.file[2]!
    state.select(target.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    const before = wrapper.findAll('g.node').length
    await chip(wrapper).find('button').trigger('click')

    expect(state.narrowedToSelection).toBe(false)
    expect(state.selectedNodeId).toBe(target.id)
    expect(wrapper.findAll('g.node').length).toBeGreaterThan(before)
  })

  it('良し悪しは示さない（N-1）', async () => {
    const { state, wrapper } = await setup()
    state.select(state.viewModel!.nodes.file[2]!.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    for (const word of ['警告', 'エラー', '多すぎ', '問題']) {
      expect(chip(wrapper).text()).not.toContain(word)
    }
  })
})

describe('絞り込みの解き方（UT-14 の決定）', () => {
  const press = async (
    wrapper: Awaited<ReturnType<typeof setup>>['wrapper'],
    target: Element = document.body,
  ) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
  }

  it('Esc で解ける。選択は残る', async () => {
    // Esc は「絞り込みをやめる」であって「選んでいたことを忘れる」ではない
    const { state, wrapper } = await setup()
    const target = state.viewModel!.nodes.file[2]!
    state.moveTo(target.id)
    await wrapper.vm.$nextTick()

    await press(wrapper)

    expect(state.narrowedToSelection).toBe(false)
    expect(state.selectedNodeId).toBe(target.id)
  })

  it('入力欄で押したときは、検索欄の取り消しを妨げない', async () => {
    // window で拾うので、文書へ繋がないとイベントが届かない
    const { state, wrapper } = await setup({ attach: true })
    await wrapper.find('input[type="search"]').setValue('Todo')
    state.moveTo(state.viewModel!.nodes.file[2]!.id)
    await wrapper.vm.$nextTick()

    await press(wrapper, wrapper.find('input[type="search"]').element)

    expect(state.narrowedToSelection).toBe(true)
    // 検索欄側の取り消しは効く
    expect(state.query).toBe('')
  })

  it('同じノードをもう一度押しても解ける', async () => {
    const { state, wrapper } = await setup()
    const node = wrapper.find('g.node')
    const id = node.attributes('data-node-id')!

    await node.trigger('click')
    // 一覧の行も同じ属性を持つ。キャンバスの中を指す
    await wrapper.find(`svg [data-node-id="${id}"]`).trigger('click')

    expect(state.narrowedToSelection).toBe(false)
    expect(state.selectedNodeId).toBe(id)
  })
})

describe('どこから選んでも同じ経路（UT-14）', () => {
  const canvasNode = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper'], id: string) =>
    wrapper.find(`svg [data-node-id="${id}"]`)
  const panelRow = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper'], id: string) =>
    wrapper.find(`.shell-panel [data-node-id="${id}"]`)

  it('一覧の行から選んでも、絞り込みが立つ', async () => {
    const { state, wrapper } = await setup()
    const target = state.viewModel!.nodes.file[3]!

    await panelRow(wrapper, target.id).trigger('click')

    expect(state.selectedNodeId).toBe(target.id)
    expect(state.narrowedToSelection).toBe(true)
  })

  it('検索の結果から選んでも、絞り込みが立つ', async () => {
    const { state, wrapper } = await setup()
    await wrapper.find('input[type="search"]').setValue('Todo')

    const row = wrapper.find('.shell-panel [data-node-id]')
    const id = row.attributes('data-node-id')!
    await row.trigger('click')

    expect(state.selectedNodeId).toBe(id)
    expect(state.narrowedToSelection).toBe(true)
  })

  it('一覧からとキャンバスからで、結果が変わらない', async () => {
    // 経路が分かれると、どこから来たかで結果が違う状態ができる
    const { state, wrapper } = await setup()
    const target = state.viewModel!.nodes.file[3]!

    await panelRow(wrapper, target.id).trigger('click')
    const fromPanel = {
      selected: state.selectedNodeId,
      narrowed: state.narrowedToSelection,
      shown: wrapper.findAll('svg g.node').length,
    }

    state.setNarrowedToSelection(false)
    state.clearSelection()
    await wrapper.vm.$nextTick()
    await canvasNode(wrapper, target.id).trigger('click')

    expect({
      selected: state.selectedNodeId,
      narrowed: state.narrowedToSelection,
      shown: wrapper.findAll('svg g.node').length,
    }).toEqual(fromPanel)
  })
})

describe('絞り込みの印の名前（UT-14）', () => {
  it('メソッドは owner.name で出す。ノードの説明と同じ規則', async () => {
    // 別々に組むと、同じノードが場所によって違う名前で出る
    const { state, wrapper } = await setup()
    const method = state.viewModel!.nodes.method.find((node) => node.owner !== null)!

    state.moveTo(method.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.shell-overlay').text()).toContain(`${method.owner}.${method.name}`)
  })
})
