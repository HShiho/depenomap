// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import App from './App.vue'
import { CYCLE_LABEL } from './shell/cycle-mark'
import MovedNodesChip from './graph-canvas/MovedNodesChip.vue'
import ViewportControls from './graph-canvas/ViewportControls.vue'
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

  /** 呼び出し順が効く題材へ絞る。メソッド粒度で、呼び出しを 2 本以上持つ */
  const narrowToCaller = async (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) => {
    const state = useViewState()
    state.setGranularity('method')
    const caller = state.viewModel!.nodes.method.find(
      (node) =>
        state.viewModel!.edges.method.filter(
          (edge) => edge.from === node.id && (edge.kind === 'call' || edge.kind === 'construct'),
        ).length > 1,
    )!
    state.select(caller.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()
  }

  it('依存先の並びが何の順なのかを、印に添える（UT-09 / US-05）', async () => {
    // 縦に並んでいれば「順序がある」とは読めるが、何の順かは図から読めない
    const { wrapper } = await setup()
    await narrowToCaller(wrapper)

    expect(chip(wrapper).text()).toContain('ソース出現順')
  })

  it('実行順ではないことを、開かないと読めない場所に置かない（C-7）', async () => {
    // 正本 JSON は実行の順序を持たない。推測させないための断りなので、
    // ホバーしないと出ない title だけに入れると役目を果たさない
    const { wrapper } = await setup()
    await narrowToCaller(wrapper)

    expect(chip(wrapper).text()).toContain('実行順ではない')
  })

  it('断りは列見出しではなく印に置く', async () => {
    // 見出しは軸の名前を出す場所（UT-08）。説明を足すと図の上に長い文字列が並ぶ
    const { wrapper } = await setup()
    await narrowToCaller(wrapper)

    const heads = wrapper.findAll('.head').map((head) => head.text())
    expect(heads.length).toBeGreaterThan(0)
    expect(heads.join(' ')).not.toContain('順')
    expect(chip(wrapper).text()).toContain('ソース出現順')
  })

  it('順序の材料が無い粒度では、断りを出さない（C-7）', async () => {
    // `sourceOrder` を持つのは call / construct だけ。ファイル粒度の依存は
    // import で、並びは出現順を表していない。そこで出現順を名乗らない
    const { state, wrapper } = await setup()
    state.select(state.viewModel!.nodes.file[2]!.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    expect(chip(wrapper).text()).toContain('周辺だけを表示中')
    expect(chip(wrapper).text()).not.toContain('ソース出現順')
  })

  it('依存先が並びようのないノードでは、断りを出さない', async () => {
    // 呼び出しが 1 本以下なら「順に並んでいる」と言えるものが無い
    const { state, wrapper } = await setup()
    state.setGranularity('method')
    const leaf = state.viewModel!.nodes.method.find(
      (node) => state.viewModel!.dependenciesOf(node.id, 'method').length === 0,
    )!
    state.select(leaf.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    expect(chip(wrapper).text()).not.toContain('ソース出現順')
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

describe('絞り込みの印の作り（UT-14）', () => {
  it('切るのは名前のほう。説明文は残す', async () => {
    // 説明文を先に落とすと、伝えたい「いま絞り込み中である」が消える
    const { state, wrapper } = await setup()
    const method = state.viewModel!.nodes.method.find((node) => node.owner !== null)!

    state.moveTo(method.id)
    await wrapper.vm.$nextTick()

    const chip = wrapper.find('.shell-overlay')
    const name = chip.find('b')
    expect(name.classes()).toContain('truncate')
    expect(chip.text()).toContain('の周辺だけを表示中')
  })
})

describe('戻る・進む（US-13 / UT-15）', () => {
  const nav = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper'], label: string) =>
    buttonWithLabel(wrapper, '.shell-toolbar', label)!

  it('はじめは、どちらも押せない', async () => {
    const { wrapper } = await setup()

    expect(nav(wrapper, '戻る').attributes('disabled')).toBeDefined()
    expect(nav(wrapper, '進む').attributes('disabled')).toBeDefined()
  })

  it('直前に見ていたノードへ戻る', async () => {
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    state.moveTo(first.id)
    state.moveTo(second.id)
    await wrapper.vm.$nextTick()
    await nav(wrapper, '戻る').trigger('click')

    expect(state.selectedNodeId).toBe(first.id)
  })

  it('戻る前にいたノードへ進む', async () => {
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    state.moveTo(first.id)
    state.moveTo(second.id)
    state.back()
    await wrapper.vm.$nextTick()
    await nav(wrapper, '進む').trigger('click')

    expect(state.selectedNodeId).toBe(second.id)
  })

  it('端にいることが、ボタンの状態で分かる', async () => {
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    state.moveTo(first.id)
    state.moveTo(second.id)
    await wrapper.vm.$nextTick()
    expect(nav(wrapper, '戻る').attributes('disabled')).toBeUndefined()
    expect(nav(wrapper, '進む').attributes('disabled')).toBeDefined()

    state.back()
    await wrapper.vm.$nextTick()
    expect(nav(wrapper, '進む').attributes('disabled')).toBeUndefined()

    state.back()
    await wrapper.vm.$nextTick()
    expect(nav(wrapper, '戻る').attributes('disabled')).toBeDefined()
  })

  it('戻った先の見え方まで帰る', async () => {
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    state.moveTo(first.id)
    state.setNarrowedToSelection(false)
    state.moveTo(second.id)
    await wrapper.vm.$nextTick()
    await nav(wrapper, '戻る').trigger('click')

    expect(state.narrowedToSelection).toBe(false)
    expect(wrapper.findAll('svg g.node').length).toBe(state.viewModel!.nodes.file.length)
  })

  it('図の上で解いたときも、戻ると解いた状態で帰る', async () => {
    /*
     * 解除の口は 3 つある（印の ✕ / Esc / 図の上で同じノードを押す）。器の口を
     * 直接叩く検査だけだと、この経路で記録が取り残されていても気付けない
     */
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    await wrapper.find(`svg [data-node-id="${first.id}"]`).trigger('click')
    await wrapper.find(`svg [data-node-id="${first.id}"]`).trigger('click')
    await wrapper.find(`svg [data-node-id="${second.id}"]`).trigger('click')
    await nav(wrapper, '戻る').trigger('click')

    expect(state.selectedNodeId).toBe(first.id)
    expect(state.narrowedToSelection).toBe(false)
  })

  it('印の ✕ で解いたときも、戻ると解いた状態で帰る', async () => {
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    await wrapper.find(`svg [data-node-id="${first.id}"]`).trigger('click')
    await wrapper.find('.shell-overlay button').trigger('click')
    await wrapper.find(`svg [data-node-id="${second.id}"]`).trigger('click')
    await nav(wrapper, '戻る').trigger('click')

    expect(state.narrowedToSelection).toBe(false)
  })

  it('経路の一覧は作らない（N-3）', async () => {
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    state.moveTo(first.id)
    state.moveTo(second.id)
    await wrapper.vm.$nextTick()

    /*
     * たどってきた経路がどこにも並ばない。**一覧を持たない領域**を見る —
     * サイドバーは全ファイルを並べるので、そこに名前が出ること自体は経路の
     * 一覧とは無関係。パンくずが置かれるとすればツールバー（戻る・進むの隣）か
     * キャンバスの上（絞り込みの印の隣）になる
     */
    for (const region of ['.shell-toolbar', '.shell-overlay']) {
      const text = wrapper.find(region).text()
      expect(text, region).not.toContain(first.name)
    }

    // 絞り込みの印は、いま選んでいる 1 件だけを出す（経路ではない）
    expect(wrapper.find('.shell-overlay').text()).toContain(second.name)
  })
})

describe('履歴に積まれる単位（UT-15 / UT-14 と一致すること）', () => {
  const canvasNode = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper'], id: string) =>
    wrapper.find(`svg [data-node-id="${id}"]`)
  const panelRow = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper'], id: string) =>
    wrapper.find(`.shell-panel [data-node-id="${id}"]`)

  it('図から選んでも一覧から選んでも、1 手として積まれる', async () => {
    // どちらも UT-14 の移動経路を通るので、積まれ方も同じになる
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    await canvasNode(wrapper, first.id).trigger('click')
    await panelRow(wrapper, second.id).trigger('click')

    expect(state.history.map((entry) => entry.nodeId)).toEqual([first.id, second.id])
  })

  it('検索から選んでも、同じように積まれる', async () => {
    const { state, wrapper } = await setup()
    await wrapper.find('input[type="search"]').setValue('Todo')

    const row = wrapper.find('.shell-panel [data-node-id]')
    const id = row.attributes('data-node-id')!
    await row.trigger('click')

    expect(state.history.map((entry) => entry.nodeId)).toEqual([id])
  })

  it('同じノードを選び直しても、二重に積まれない', async () => {
    const { state, wrapper } = await setup()
    const target = state.viewModel!.nodes.file[2]!

    await canvasNode(wrapper, target.id).trigger('click')
    await panelRow(wrapper, target.id).trigger('click')

    expect(state.history).toHaveLength(1)
  })

  it('絞り込みの解除・選択の解除は積まない', async () => {
    // 「移動」ではないものを拾わない
    const { state, wrapper } = await setup()
    const target = state.viewModel!.nodes.file[2]!

    await canvasNode(wrapper, target.id).trigger('click')
    await canvasNode(wrapper, target.id).trigger('click')
    await canvasNode(wrapper, target.id).trigger('click')

    expect(state.selectedNodeId).toBeUndefined()
    expect(state.history).toHaveLength(1)
  })

  it('粒度と並べ方の切り替えは積まない', async () => {
    const { state, wrapper } = await setup()
    await canvasNode(wrapper, state.viewModel!.nodes.file[2]!.id).trigger('click')

    state.setGranularity('method')
    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    expect(state.history).toHaveLength(1)
  })

  it('戻る・進む自体は積まない', async () => {
    const { state, wrapper } = await setup()
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!

    await canvasNode(wrapper, first.id).trigger('click')
    await panelRow(wrapper, second.id).trigger('click')
    state.back()
    state.forward()
    await wrapper.vm.$nextTick()

    expect(state.history).toHaveLength(2)
  })

  it('戻ったあと別のノードへ移動すると、進む先は捨てる', async () => {
    const { state, wrapper } = await setup()
    const [first, second, third] = state.viewModel!.nodes.file

    await canvasNode(wrapper, first!.id).trigger('click')
    await panelRow(wrapper, second!.id).trigger('click')
    state.back()
    await wrapper.vm.$nextTick()
    await panelRow(wrapper, third!.id).trigger('click')

    expect(state.history.map((entry) => entry.nodeId)).toEqual([first!.id, third!.id])
    expect(state.canGoForward).toBe(false)
  })

  it('読み込み直すと履歴は残らない（C-3）', async () => {
    const { state, wrapper } = await setup()
    await canvasNode(wrapper, state.viewModel!.nodes.file[2]!.id).trigger('click')

    state.applyLoadOutcome({ kind: 'loading' })
    await wrapper.vm.$nextTick()

    expect(state.history).toHaveLength(0)
    expect(state.canGoBack).toBe(false)
  })
})

describe('戻る・進むが持たないもの（UT-15）', () => {
  it('キーボードを奪わない', async () => {
    /*
     * `Alt` + 矢印はブラウザの戻る・進む。奪うと利用者がページを離れる手段を
     * 失う。`Backspace` も入力欄の外で同じ意味を持つ環境がある
     */
    const { state, wrapper } = await setup({ attach: true })
    const first = state.viewModel!.nodes.file[2]!
    const second = state.viewModel!.nodes.file[3]!
    state.moveTo(first.id)
    state.moveTo(second.id)
    await wrapper.vm.$nextTick()

    for (const event of [
      new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }),
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
    ]) {
      document.body.dispatchEvent(event)
      await wrapper.vm.$nextTick()
    }

    expect(state.selectedNodeId).toBe(second.id)
  })
})

describe('一覧に出る循環の印（US-06 / UT-10）', () => {
  /** 型のみの循環（`c_0001`）に含まれるファイル */
  const typeOnly = 'file:src/domain/Todo.ts'

  /*
   * 行は「選ぶボタン」と「印の並び」の 2 つでできている（UT-12）。`data-node-id`
   * が付くのはボタンのほうなので、印を見るには行そのものを取る
   */
  const rowOf = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper'], id: string) => {
    const row = wrapper.find(`[data-node-id="${id}"]`).element.parentElement
    if (row === null) throw new Error(`行が無い: ${id}`)
    return {
      text: () => row.textContent ?? '',
      titles: () => [...row.querySelectorAll('[title]')].map((el) => el.getAttribute('title')),
    }
  }

  it('循環に含まれるファイルの行に印が出る', async () => {
    const { state, wrapper } = await setup()
    const inCycle = state.viewModel!.nodes.file.find(
      (node) => state.viewModel!.cyclesOf(node.id).length > 0,
    )!

    expect(rowOf(wrapper, inCycle.id).text()).toContain('循環')
  })

  it('循環に含まれないファイルの行には出ない', async () => {
    const { state, wrapper } = await setup()
    const outside = state.viewModel!.nodes.file.find(
      (node) => state.viewModel!.cyclesOf(node.id).length === 0,
    )!

    expect(rowOf(wrapper, outside.id).text()).not.toContain('循環')
  })

  it('メソッドの行にも出る', async () => {
    const { state, wrapper } = await setup()
    const method = state.viewModel!.nodes.method.find(
      (node) => state.viewModel!.cyclesOf(node.id).length > 0,
    )!
    // メソッドは所属ファイルを開かないと出ない
    state.select(method.id)
    await wrapper.vm.$nextTick()

    expect(rowOf(wrapper, method.id).text()).toContain('循環')
  })

  it('行では型のみかどうかまで言わない。説明では読める', async () => {
    // 行の幅は名前とパスが使う。型のみであることは図の印が出す
    const { wrapper } = await setup()

    expect(rowOf(wrapper, typeOnly).text()).toContain('循環')
    expect(rowOf(wrapper, typeOnly).text()).not.toContain('型のみ')
    expect(rowOf(wrapper, typeOnly).titles()).toContain('循環（型のみ）')
  })

  it('行の文言は、図と同じ 1 箇所から来る', async () => {
    // 行だけ別に持つと、同じ行の中で表示と説明が食い違いうる
    const { state, wrapper } = await setup()
    const inCycle = state.viewModel!.nodes.file.find(
      (node) => state.viewModel!.cyclesOf(node.id).length > 0,
    )!

    expect(rowOf(wrapper, inCycle.id).text()).toContain(CYCLE_LABEL)
  })

  it('是正の示唆や深刻度を出さない（N-1）', async () => {
    const { state, wrapper } = await setup()
    const inCycle = state.viewModel!.nodes.file.find(
      (node) => state.viewModel!.cyclesOf(node.id).length > 0,
    )!

    for (const word of ['警告', 'エラー', '違反', '重大', '修正']) {
      expect(rowOf(wrapper, inCycle.id).text()).not.toContain(word)
    }
  })
})

describe('概要の開閉（US-11 / UT-13）', () => {
  const sheet = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) =>
    wrapper.find('[role="dialog"]')

  const open = async (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) => {
    await wrapper.find('[aria-label="概要を開く"]').trigger('click')
  }

  it('起動直後は出ない。図が先に見える', async () => {
    const { wrapper } = await setup()

    expect(sheet(wrapper).exists()).toBe(false)
    expect(wrapper.findAll('g.node').length).toBeGreaterThan(0)
  })

  it('レールのボタンで開く', async () => {
    const { wrapper } = await setup()

    await open(wrapper)

    expect(sheet(wrapper).exists()).toBe(true)
  })

  it('✕ で閉じる', async () => {
    const { wrapper } = await setup()
    await open(wrapper)

    await sheet(wrapper).find('[aria-label="概要を閉じる"]').trigger('click')

    expect(sheet(wrapper).exists()).toBe(false)
  })

  it('外側を押すと閉じる', async () => {
    // シートの外を押して閉じられないと、レールまで戻らないと閉じられない
    const { wrapper } = await setup()
    await open(wrapper)

    await sheet(wrapper).element.parentElement!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await wrapper.vm.$nextTick()

    expect(sheet(wrapper).exists()).toBe(false)
  })

  it('中を押しても閉じない', async () => {
    const { wrapper } = await setup()
    await open(wrapper)

    await sheet(wrapper).trigger('click')

    expect(sheet(wrapper).exists()).toBe(true)
  })

  it('Esc で閉じる。絞り込みは解かない', async () => {
    // 重なっている面から順に閉じる。先に絞り込みを解くと、閉じたあとに図が変わっている
    const { state, wrapper } = await setup({ attach: true })
    state.moveTo(state.viewModel!.nodes.file[2]!.id)
    await wrapper.vm.$nextTick()
    await open(wrapper)

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(sheet(wrapper).exists()).toBe(false)
    expect(state.narrowedToSelection).toBe(true)
  })

  it('このグラフの素性が読める', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)
    const meta = state.viewModel!.meta

    const text = sheet(wrapper).text()
    expect(text).toContain(meta.snapshot.label)
    expect(text).toContain(meta.snapshot.branch)
    // commit は全文。確かめにくる場所で切ると、確かめる先が無くなる
    expect(text).toContain(meta.snapshot.commit)
    expect(text).toContain(meta.tsconfig)
    expect(text).toContain(meta.rootDir)
  })

  it('規模が読める', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)

    const text = sheet(wrapper).text()
    expect(text).toContain(String(state.viewModel!.nodes.file.length))
    expect(text).toContain(String(state.viewModel!.nodes.method.length))
    expect(text).toContain('ファイル')
    expect(text).toContain('メソッド')
  })

  it('層ごとの構成比が読める', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)

    const band = sheet(wrapper).find('[aria-label="層ごとの構成比"]')
    expect(band.exists()).toBe(true)
    // 区画は層の数だけ。並びは図の列（UT-08）と同じ `layerKeys` の順
    expect(band.findAll('i')).toHaveLength(state.viewModel!.layerKeys.length)
  })

  it('構成比の合計がファイル数と合う', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)

    const band = sheet(wrapper).find('[aria-label="層ごとの構成比"]')
    const counts = band.findAll('i').map((part) => {
      const title = part.attributes('title') ?? ''
      return Number(/ (\d+) ファイル/.exec(title)?.[1] ?? 0)
    })

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(state.viewModel!.nodes.file.length)
  })

  it('影響範囲の大きいファイルから、図へ移れる', async () => {
    // 移動は UT-14 の経路を通す。概要から選んだときだけ絞り込みが立たない、
    // 履歴に積まれない、といった食い違いを作らない
    const { state, wrapper } = await setup()
    await open(wrapper)
    const top = state.viewModel!.nodesByFanInDesc('file')[0]!

    await sheet(wrapper).find(`[data-node-id="${top.id}"]`).trigger('click')

    expect(state.selectedNodeId).toBe(top.id)
    expect(state.narrowedToSelection).toBe(true)
    expect(state.history.at(-1)?.nodeId).toBe(top.id)
  })

  it('移ったらシートを閉じる', async () => {
    // 閉じないと、移った先の図が覆われたままになる
    const { state, wrapper } = await setup()
    await open(wrapper)
    const top = state.viewModel!.nodesByFanInDesc('file')[0]!

    await sheet(wrapper).find(`[data-node-id="${top.id}"]`).trigger('click')

    expect(sheet(wrapper).exists()).toBe(false)
  })

  it('開いているあいだ、裏は触れない', async () => {
    // 覆いは見た目だけで裏が生きていると、Tab で裏の入力欄へ抜けられる
    const { wrapper } = await setup()
    await open(wrapper)

    for (const selector of ['nav', 'aside', 'main']) {
      expect(wrapper.find(selector).attributes()).toHaveProperty('inert')
    }
  })

  it('閉じると裏が戻る', async () => {
    const { wrapper } = await setup()
    await open(wrapper)
    await sheet(wrapper).find('[aria-label="概要を閉じる"]').trigger('click')

    expect(wrapper.find('main').attributes()).not.toHaveProperty('inert')
  })

  it('開くと焦点がシートへ移り、閉じると開いた口へ戻る', async () => {
    // 裏を `inert` にするので、焦点が裏に残ると行き場が無くなる
    const { wrapper } = await setup({ attach: true })
    const button = wrapper.find('[aria-label="概要を開く"]')
    ;(button.element as HTMLElement).focus()
    await open(wrapper)

    expect(document.activeElement).toBe(wrapper.find('[role="dialog"]').element)

    await sheet(wrapper).find('[aria-label="概要を閉じる"]').trigger('click')

    expect(document.activeElement).toBe(button.element)
  })

  it('読めていないあいだは押せない', async () => {
    // 押しても何も出ない口を残すと、押したことが効いたのかが分からない
    const { state, wrapper } = await setup()
    state.applyLoadOutcome({ kind: 'loading' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[title="概要"]').attributes()).toHaveProperty('disabled')
  })

  it('レールの口は開く専用。押下状態としては読み上げない', async () => {
    // 開いているあいだレールは `inert` で、そこへは戻ってこられない。
    // 押下状態だと読み上げると、その口で閉じられるように見えてしまう
    const { wrapper } = await setup()
    await open(wrapper)

    const button = wrapper.find('[title="概要"]')
    expect(button.attributes()).not.toHaveProperty('aria-pressed')
    expect(button.attributes('aria-label')).toBe('概要を開く')
  })

  it('読み込み結果が ready を外れたら、裏も戻す', async () => {
    // シートだけ消えて裏が `inert` のまま残ると、画面全体が触れなくなる
    const { state, wrapper } = await setup()
    await open(wrapper)

    state.applyLoadOutcome({ kind: 'unreachable', message: '読めない' })
    await wrapper.vm.$nextTick()

    expect(sheet(wrapper).exists()).toBe(false)
    expect(wrapper.find('main').attributes()).not.toHaveProperty('inert')
  })

  it('読み直しても、概要が独りでに開かない', async () => {
    // 隠すだけだと「開いている」が残り、読めた瞬間に立ち上がる
    const { state, wrapper } = await setup()
    await open(wrapper)
    state.applyLoadOutcome({ kind: 'unreachable', message: '読めない' })
    await wrapper.vm.$nextTick()

    state.applyLoadOutcome({ kind: 'ready', viewModel: state.viewModel!, warnings: [] })
    await wrapper.vm.$nextTick()

    expect(sheet(wrapper).exists()).toBe(false)
  })

  it('違反件数や指摘を出さない（N-1）', async () => {
    const { wrapper } = await setup()
    await open(wrapper)

    for (const word of ['違反', '指摘', '警告', 'エラー', 'スコア', '健全']) {
      expect(sheet(wrapper).text()).not.toContain(word)
    }
  })

  it('書き出す口を持たない（N-5）', async () => {
    const { wrapper } = await setup()
    await open(wrapper)

    for (const word of ['書き出', 'エクスポート', 'ダウンロード', 'PDF', '印刷']) {
      expect(sheet(wrapper).text()).not.toContain(word)
    }
    expect(sheet(wrapper).findAll('a[download]')).toHaveLength(0)
  })
})

describe('図の見ている位置の口（US-16 / UT-16）', () => {
  const spin = async (
    wrapper: Awaited<ReturnType<typeof setup>>['wrapper'],
    init: Partial<WheelEventInit> = {},
  ) => {
    wrapper
      .find('svg.canvas')
      .element.dispatchEvent(new WheelEvent('wheel', { cancelable: true, bubbles: true, ...init }))
    await wrapper.vm.$nextTick()
  }

  const viewportOf = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) =>
    JSON.parse(
      JSON.stringify(
        (
          wrapper.findComponent({ name: 'GraphCanvas' }).vm as unknown as {
            viewport: { x: number; y: number; scale: number }
          }
        ).viewport,
      ),
    ) as { x: number; y: number; scale: number }

  /** 倍率の表示 */
  const zoomLabel = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) =>
    wrapper.findComponent(ViewportControls).find('span')

  /**
   * 実寸を入れてから測る。
   *
   * jsdom に `ResizeObserver` が無いため、`App` 経由では実寸が 0×0 のまま
   * 入らない。0×0 では全体表示が等倍を返すので、**何を呼んでも 100% になり**
   * 「戻った」ことを見たつもりの検査が素通りする。
   */
  const sized = async () => {
    const found = await setup()
    found.state.setCanvasSize(1200, 800)
    await found.wrapper.vm.$nextTick()
    return found
  }

  it('拡大率が読める', async () => {
    // 出さないと、上下限に当たったのか操作が効いていないのかが区別できない
    const { wrapper } = await sized()

    expect(zoomLabel(wrapper).text()).toMatch(/^拡大率\d+%$/)
  })

  it('ピンチすると、拡大率の表示も動く', async () => {
    const { wrapper } = await sized()
    const before = zoomLabel(wrapper).text()

    await spin(wrapper, { deltaY: -200, ctrlKey: true })

    expect(zoomLabel(wrapper).text()).not.toBe(before)
  })

  it('全体表示で、動かしたぶんが戻る', async () => {
    // 手で動かして迷子になったときに戻れる口
    const { wrapper } = await sized()
    const fitted = { ...viewportOf(wrapper) }
    // 全体表示は等倍とは限らない。等倍だと「何をしても 100%」と区別が付かない
    expect(fitted.scale).not.toBe(1)

    await spin(wrapper, { deltaY: -200, ctrlKey: true })
    await spin(wrapper, { deltaX: 120, deltaY: 90 })
    expect(viewportOf(wrapper)).not.toEqual(fitted)

    await wrapper.find('[aria-label="全体を表示"]').trigger('click')

    // 倍率だけでなく、動かした位置も戻る
    expect(viewportOf(wrapper)).toEqual(fitted)
  })
})

describe('手で動かした配置（US-17 / US-18 / UT-17）', () => {
  /** ノードを掴んで動かして離す */
  const drag = async (
    wrapper: Awaited<ReturnType<typeof setup>>['wrapper'],
    id: string,
    to: { x: number; y: number },
  ) => {
    wrapper
      .find(`g[data-node-id="${id}"]`)
      .element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
      )
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: to.x, clientY: to.y }))
    window.dispatchEvent(new MouseEvent('pointerup', {}))
    await wrapper.vm.$nextTick()
  }

  const resetButton = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) =>
    wrapper.find('[title="配置を戻す"]')

  const chip = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) =>
    wrapper.findComponent(MovedNodesChip)

  it('動かしていないときは、リセットが押せない', async () => {
    // 押せるかどうかが、そのままリセットの効く状態を表す
    const { wrapper } = await setup()

    expect(resetButton(wrapper).attributes()).toHaveProperty('disabled')
    expect(chip(wrapper).text()).toBe('')
  })

  it('動かすと、件数が図の上に出てリセットが押せる', async () => {
    const { state, wrapper } = await setup()
    const id = state.viewModel!.nodes.file[2]!.id

    await drag(wrapper, id, { x: 300, y: 280 })

    expect(chip(wrapper).text()).toContain('1')
    expect(resetButton(wrapper).attributes()).not.toHaveProperty('disabled')
  })

  it('印に触れると、どのノードを動かしたのかが出る', async () => {
    // 件数だけでは、図の中から探し直すことになる
    const { state, wrapper } = await setup()
    const node = state.viewModel!.nodes.file[2]!
    await drag(wrapper, node.id, { x: 300, y: 280 })

    expect(chip(wrapper).text()).not.toContain(node.name)
    await chip(wrapper).trigger('focusin')

    expect(chip(wrapper).text()).toContain(node.name)
  })

  it('リセットで、印もボタンも元に戻る', async () => {
    const { state, wrapper } = await setup()
    await drag(wrapper, state.viewModel!.nodes.file[2]!.id, { x: 300, y: 280 })

    await resetButton(wrapper).trigger('click')

    expect(chip(wrapper).text()).toBe('')
    expect(resetButton(wrapper).attributes()).toHaveProperty('disabled')
  })

  it('動かしたことを問題として扱わない（N-1）', async () => {
    const { state, wrapper } = await setup()
    await drag(wrapper, state.viewModel!.nodes.file[2]!.id, { x: 300, y: 280 })
    await chip(wrapper).trigger('focusin')

    for (const word of ['警告', 'エラー', '崩れ', '問題', '戻してください']) {
      expect(chip(wrapper).text()).not.toContain(word)
    }
  })
})

describe('追跡できなかった依存（US-21 / UT-19）', () => {
  const sheet = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) =>
    wrapper.find('[aria-label="追跡できなかった依存"][role="dialog"]')

  const open = async (wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) => {
    await wrapper.find('[aria-label="追跡できなかった依存を開く"]').trigger('click')
  }

  it('レールから開ける', async () => {
    const { wrapper } = await setup()

    await open(wrapper)

    expect(sheet(wrapper).exists()).toBe(true)
  })

  it('呼び出し元・式・理由が分かる', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)
    const first = state.viewModel!.unresolved[0]!

    const text = sheet(wrapper).text()
    expect(text).toContain(first.expression)
    expect(text).toContain(state.viewModel!.nodeById.get(first.from)!.name)
    expect(text).toContain('DI コンテナの文字列トークン')
  })

  it('全件出る', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)

    expect(sheet(wrapper).findAll('[data-unresolved-id]')).toHaveLength(
      state.viewModel!.unresolved.length,
    )
  })

  it('候補が推測であることが分かる', async () => {
    // 確定した依存と同じ言い方にしない
    const { state, wrapper } = await setup()
    await open(wrapper)
    const withCandidates = state.viewModel!.unresolved.find((u) => u.candidates.length > 0)!

    const row = sheet(wrapper).find(`[data-unresolved-id="${withCandidates.id}"]`)
    expect(row.text()).toContain('推測した行き先')
  })

  it('候補が無いものも破綻しない', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)
    const without = state.viewModel!.unresolved.find((u) => u.candidates.length === 0)!

    const row = sheet(wrapper).find(`[data-unresolved-id="${without.id}"]`)
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('絞り込めていません')
    expect(row.findAll('[data-node-id]')).toHaveLength(0)
  })

  it('候補から図へ移れる。移動は UT-14 の経路', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)
    const guess = state.viewModel!.unresolved.find((u) => u.candidates.length > 0)!
    const candidate = guess.candidates[0]!

    await sheet(wrapper).find(`[data-node-id="${candidate}"]`).trigger('click')

    expect(state.selectedNodeId).toBe(candidate)
    expect(state.narrowedToSelection).toBe(true)
    expect(state.history.at(-1)?.nodeId).toBe(candidate)
  })

  it('移った先でも、推測で来たことが分かる', async () => {
    // 確定した依存をたどって来たのかが区別できないと、読み取る構造が実態とずれる
    const { state, wrapper } = await setup()
    await open(wrapper)
    const guess = state.viewModel!.unresolved.find((u) => u.candidates.length > 0)!

    await sheet(wrapper).find(`[data-node-id="${guess.candidates[0]!}"]`).trigger('click')

    expect(sheet(wrapper).exists()).toBe(false)
    expect(wrapper.find('.shell-overlay').text()).toContain(guess.expression)
  })

  it('次に移ると、推測の印は消える', async () => {
    // 推測で来たのは 1 手前まで
    const { state, wrapper } = await setup()
    await open(wrapper)
    const guess = state.viewModel!.unresolved.find((u) => u.candidates.length > 0)!
    await sheet(wrapper).find(`[data-node-id="${guess.candidates[0]!}"]`).trigger('click')

    state.moveTo(state.viewModel!.nodes.file[2]!.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.shell-overlay').text()).not.toContain(guess.expression)
  })

  it('戻ると、推測の印は消える', async () => {
    // 履歴の長さは変わらないので、移動の回数で消すと取り残される
    const { state, wrapper } = await setup()
    state.moveTo(state.viewModel!.nodes.file[2]!.id)
    await open(wrapper)
    const guess = state.viewModel!.unresolved.find((u) => u.candidates.length > 0)!
    await sheet(wrapper).find(`[data-node-id="${guess.candidates[0]!}"]`).trigger('click')
    expect(wrapper.find('.shell-overlay').text()).toContain(guess.expression)

    state.back()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.shell-overlay').text()).not.toContain(guess.expression)
  })

  it('進んで戻ってくれば、また出る', async () => {
    // 印は「どこにいるか」で決まる。推測で来たノードへ帰れば、また推測のまま
    const { state, wrapper } = await setup()
    state.moveTo(state.viewModel!.nodes.file[2]!.id)
    await open(wrapper)
    const guess = state.viewModel!.unresolved.find((u) => u.candidates.length > 0)!
    await sheet(wrapper).find(`[data-node-id="${guess.candidates[0]!}"]`).trigger('click')
    state.back()
    await wrapper.vm.$nextTick()

    state.forward()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.shell-overlay').text()).toContain(guess.expression)
  })

  it('選択が外れたら、推測の印も消える', async () => {
    const { state, wrapper } = await setup()
    await open(wrapper)
    const guess = state.viewModel!.unresolved.find((u) => u.candidates.length > 0)!
    await sheet(wrapper).find(`[data-node-id="${guess.candidates[0]!}"]`).trigger('click')

    state.clearSelection()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.shell-overlay').text()).not.toContain(guess.expression)
  })

  it('概要と同時には出さない', async () => {
    // 重ねると、裏のシートが触れないまま残る
    const { wrapper } = await setup()
    await open(wrapper)

    await wrapper.find('[aria-label="概要を開く"]').trigger('click')

    expect(sheet(wrapper).exists()).toBe(false)
    expect(wrapper.find('[aria-label="依存関係の概要"]').exists()).toBe(true)
  })

  it('欠陥として扱わない（N-1）', async () => {
    const { wrapper } = await setup()
    await open(wrapper)

    for (const word of ['違反', 'エラー', '警告', '修正してください', '問題']) {
      expect(sheet(wrapper).text()).not.toContain(word)
    }
  })
})
