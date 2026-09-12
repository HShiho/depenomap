// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'
import SidebarList from './SidebarList.vue'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

beforeEach(() => setActivePinia(createPinia()))

function setup(options: { withGraph?: boolean } = {}) {
  const state = useViewState()
  if (options.withGraph !== false) {
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  }
  return { state, wrapper: mount(SidebarList, { props: { sort: 'path' } }) }
}

/** ファイル行の開閉ボタン。1 行につき 1 つある */
const fileRows = (wrapper: ReturnType<typeof setup>['wrapper']) =>
  wrapper.findAll('[aria-expanded]')

/** 指定したファイルの行を開く */
async function openFile(wrapper: ReturnType<typeof setup>['wrapper'], fileId: string) {
  const row = wrapper.find(`[data-node-id="${fileId}"]`)
  await row.element
    .parentElement!.querySelector('[aria-expanded]')!
    .dispatchEvent(new Event('click'))
  await wrapper.vm.$nextTick()
}

describe('一覧（US-09）', () => {
  it('すべてのファイルが行として出る', () => {
    const { wrapper } = setup()

    expect(fileRows(wrapper)).toHaveLength(viewModel.nodes.file.length)
  })

  it('初期表示ではメソッドが 1 件も出ていない', () => {
    const { wrapper } = setup()

    expect(fileRows(wrapper).every((row) => row.attributes('aria-expanded') === 'false')).toBe(true)
    expect(wrapper.text()).not.toContain('execute')
  })

  it('ファイルを開くと、そのファイルのメソッドだけが並ぶ', async () => {
    const { wrapper } = setup()
    const target = viewModel.nodes.file.find(
      (file) => (viewModel.methodsOfFile.get(file.id) ?? []).length > 1,
    )!

    await openFile(wrapper, target.id)

    const shown = viewModel.nodes.method.filter((method) =>
      wrapper.find(`[data-node-id="${method.id}"]`).exists(),
    )
    expect(shown.map((method) => method.id).sort()).toEqual(
      viewModel.methodsOfFile
        .get(target.id)!
        .map((method) => method.id)
        .sort(),
    )
  })

  it('もう一度押すと閉じる', async () => {
    const { wrapper } = setup()
    const row = () => fileRows(wrapper)[0]!

    await row().trigger('click')
    await row().trigger('click')

    expect(row().attributes('aria-expanded')).toBe('false')
  })

  it('ファイルを開いても、他のファイルは閉じたまま', async () => {
    const { wrapper } = setup()
    await fileRows(wrapper)[0]!.trigger('click')

    const open = fileRows(wrapper).filter((row) => row.attributes('aria-expanded') === 'true')
    expect(open).toHaveLength(1)
  })

  it('グラフが無ければ何も出ない。落ちもしない', () => {
    const { wrapper } = setup({ withGraph: false })

    expect(fileRows(wrapper)).toHaveLength(0)
  })
})

describe('一覧からの選択', () => {
  it('ファイル行を押すと選択される', async () => {
    const { state, wrapper } = setup()
    const target = viewModel.nodes.file[3]!

    await wrapper.find(`[data-node-id="${target.id}"]`).trigger('click')

    expect(state.selectedNodeId).toBe(target.id)
  })

  it('メソッド行を押すと、粒度のほうが合う（UT-05 の規則）', async () => {
    const { state, wrapper } = setup()
    const file = viewModel.nodes.file.find(
      (node) => (viewModel.methodsOfFile.get(node.id) ?? []).length > 0,
    )!
    const method = viewModel.methodsOfFile.get(file.id)![0]!

    await openFile(wrapper, file.id)
    await wrapper.find(`[data-node-id="${method.id}"]`).trigger('click')

    expect(state.selectedNodeId).toBe(method.id)
    expect(state.granularity).toBe('method')
  })

  it('選択中の行は、それと分かる', async () => {
    const { state, wrapper } = setup()
    const target = viewModel.nodes.file[2]!

    state.select(target.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find(`[data-node-id="${target.id}"]`).attributes('aria-current')).toBe('true')
  })
})

describe('選択への追従', () => {
  it('メソッドが選ばれたら、所属ファイルを開く', async () => {
    // 閉じたファイルの中のメソッドが選ばれると、面からは何も読めない
    const { state, wrapper } = setup()
    const method = viewModel.nodes.method[5]!

    state.select(method.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find(`[data-node-id="${method.id}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-node-id="${method.id}"]`).attributes('aria-current')).toBe('true')
  })

  it('ファイルが選ばれただけでは開かない', async () => {
    // 中身を見たいかどうかは別の話。勝手に開くと一覧が伸びる
    const { state, wrapper } = setup()
    const file = viewModel.nodes.file.find(
      (node) => (viewModel.methodsOfFile.get(node.id) ?? []).length > 0,
    )!

    state.select(file.id)
    await wrapper.vm.$nextTick()

    const caret = wrapper
      .find(`[data-node-id="${file.id}"]`)
      .element.parentElement!.querySelector('[aria-expanded]')!
    expect(caret.getAttribute('aria-expanded')).toBe('false')
  })

  it('選択中のメソッドを含むファイルは、閉じる操作を受け付けないと示す', async () => {
    // 閉じられると、選択だけ進んで一覧からは見えない状態ができる
    const { state, wrapper } = setup()
    const method = viewModel.nodes.method[5]!

    state.select(method.id)
    await wrapper.vm.$nextTick()

    const caret = wrapper
      .find(`[data-node-id="${method.parent}"]`)
      .element.parentElement!.querySelector('[aria-expanded]') as HTMLButtonElement
    expect(caret.disabled).toBe(true)
    expect(caret.getAttribute('aria-label')).toContain('閉じられない')
  })

  it('自分で開いたファイルは、選択が動いても閉じない', async () => {
    const { state, wrapper } = setup()
    const first = viewModel.nodes.file[0]!
    const method = viewModel.nodes.method[5]!

    await openFile(wrapper, first.id)
    state.select(method.id)
    await wrapper.vm.$nextTick()

    const caret = wrapper
      .find(`[data-node-id="${first.id}"]`)
      .element.parentElement!.querySelector('[aria-expanded]')!
    expect(caret.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('図の入れ替え', () => {
  it('読み直したら、開閉を引き継がない（US-09）', async () => {
    // ファイルの ID はパス由来。同じパスがあると開いたまま引き継がれる
    const { state, wrapper } = setup()
    const target = viewModel.nodes.file[0]!

    await openFile(wrapper, target.id)
    state.applyLoadOutcome({ kind: 'ready', viewModel: buildViewModel(result.graph), warnings: [] })
    await wrapper.vm.$nextTick()

    const caret = wrapper
      .find(`[data-node-id="${target.id}"]`)
      .element.parentElement!.querySelector('[aria-expanded]')!
    expect(caret.getAttribute('aria-expanded')).toBe('false')
  })
})
