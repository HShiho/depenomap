// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'
import SidebarPanel from './SidebarPanel.vue'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

beforeEach(() => setActivePinia(createPinia()))

function setup() {
  const state = useViewState()
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  return { state, wrapper: mount(SidebarPanel) }
}

/**
 * 被依存数がばらけているメソッドを持つファイルを開く。
 *
 * 「メソッドを持つ最初のファイル」だと、このフィクスチャではファイルも
 * メソッドも全部 0 で、0 と 0 を照合するだけになる
 */
async function openFileWithVaryingCounts(wrapper: ReturnType<typeof setup>['wrapper']) {
  const target = viewModel.nodes.file.find((file) => {
    const counts = (viewModel.methodsOfFile.get(file.id) ?? []).map((method) =>
      viewModel.fanInOf(method.id, 'method'),
    )
    return new Set(counts).size > 1
  })!
  wrapper
    .find(`[data-node-id="${target.id}"]`)
    .element.parentElement!.querySelector('[aria-expanded]')!
    .dispatchEvent(new Event('click'))
  await wrapper.vm.$nextTick()
}

/** 一覧に出ているファイル行を、上から順に */
const shownFiles = (wrapper: ReturnType<typeof setup>['wrapper']) =>
  wrapper
    .findAll('[data-node-id]')
    .map((row) => row.attributes('data-node-id')!)
    .filter((id) => id.startsWith('file:'))

describe('並べ替え（US-10）', () => {
  it('選択肢はパス順と被依存数の降順', () => {
    const { wrapper } = setup()

    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      'パス順',
      '被依存数（降順）',
    ])
  })

  it('既定はパス順', () => {
    const { wrapper } = setup()
    const paths = shownFiles(wrapper).map((id) => viewModel.nodeById.get(id)!)

    expect(wrapper.find('select').element.value).toBe('path')
    expect(paths.map((node) => (node.kind === 'file' ? node.path : ''))).toEqual(
      viewModel.nodes.file.map((file) => file.path).sort((a, b) => a.localeCompare(b)),
    )
  })

  it('被依存数を選ぶと、多い順に並び替わる', async () => {
    const { wrapper } = setup()
    await wrapper.find('select').setValue('fan-in')

    const counts = shownFiles(wrapper).map((id) => viewModel.fanInOf(id, 'file'))
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(counts[0]).toBeGreaterThan(counts.at(-1)!)
  })

  it('並べ替えても、開いているファイルは開いたまま', async () => {
    const { wrapper } = setup()
    const target = viewModel.nodes.file.find(
      (file) => (viewModel.methodsOfFile.get(file.id) ?? []).length > 0,
    )!
    const caretOf = (id: string) =>
      wrapper
        .find(`[data-node-id="${id}"]`)
        .element.parentElement!.querySelector('[aria-expanded]')!

    caretOf(target.id).dispatchEvent(new Event('click'))
    await wrapper.vm.$nextTick()
    await wrapper.find('select').setValue('fan-in')

    expect(caretOf(target.id).getAttribute('aria-expanded')).toBe('true')
  })

  it('ファイル数を出す', () => {
    const { wrapper } = setup()

    expect(wrapper.text()).toContain(`${viewModel.nodes.file.length} ファイル`)
  })

  it('並べ替えに名前を与える', () => {
    const { wrapper } = setup()
    const id = wrapper.find('select').attributes('id')

    expect(wrapper.find(`label[for="${id}"]`).text()).toBe('並べ替え')
  })
})

describe('持たないもの', () => {
  it('依存元／依存先の一覧を作らない（N-4）', async () => {
    /*
     * ノードマップを見れば分かるものを、面の側に二重に持たない。
     *
     * 出ている文字で見ると、見出し語を変えた実装（「参照元」など）が素通りする。
     * **たどっていないこと**を見る — 依存をノード単位で並べる口を、どれも
     * 呼んでいないことを確かめる
     */
    const dependenciesOf = vi.spyOn(viewModel, 'dependenciesOf')
    const dependentsOf = vi.spyOn(viewModel, 'dependentsOf')
    const dependentNodesOf = vi.spyOn(viewModel, 'dependentNodesOf')
    try {
      const { state, wrapper } = setup()
      await openFileWithVaryingCounts(wrapper)
      state.select(viewModel.nodes.file[2]!.id)
      await wrapper.vm.$nextTick()

      expect(dependenciesOf).not.toHaveBeenCalled()
      expect(dependentsOf).not.toHaveBeenCalled()
      expect(dependentNodesOf).not.toHaveBeenCalled()
    } finally {
      dependenciesOf.mockRestore()
      dependentsOf.mockRestore()
      dependentNodesOf.mockRestore()
    }
  })

  it('被依存数を数え直さない。メソッド行も同じ', async () => {
    // 面が独自に数えると、図と一覧で違う数が出る
    const { wrapper } = setup()
    // 初期は全部閉じている。開かないと、メソッド行を一度も見ないまま通る
    await openFileWithVaryingCounts(wrapper)

    const rows = wrapper.findAll('[data-node-id]')
    const kinds = new Set(rows.map((row) => row.attributes('data-node-id')!.split(':')[0]))
    expect(kinds).toEqual(new Set(['file', 'method']))

    const shown = new Set<string>()
    for (const row of rows) {
      const id = row.attributes('data-node-id')!
      const granularity = id.startsWith('file:') ? 'file' : 'method'
      // 行のテキストには名前もパスも混ざる。数の印だけを見て、完全に一致させる
      const badge = row.element.parentElement!.querySelector('[title^="被依存数"]')!
      expect(badge.textContent!.trim()).toBe(String(viewModel.fanInOf(id, granularity)))
      if (granularity === 'method') shown.add(badge.textContent!.trim())
    }

    // 全部 0 のファイルを開いていると、0 と 0 を照合するだけになる
    expect(shown.size).toBeGreaterThan(1)
  })

  it('一覧が縦に伸びても、面の中だけでスクロールする', () => {
    // 面ごと伸びると、並べ替えや検索（UT-11）が画面の外へ出る
    const { wrapper } = setup()
    const scroller = wrapper.find('.overflow-y-auto')

    expect(scroller.exists()).toBe(true)
    expect(scroller.find('[data-node-id]').exists()).toBe(true)
    expect(wrapper.find('select').element.closest('.overflow-y-auto')).toBeNull()
  })
})

describe('印の差し込み（UT-10 / UT-11 の受け皿）', () => {
  it('面越しに、ファイル行へ印を差し込める', () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const wrapper = mount(SidebarPanel, {
      slots: { 'file-badges': '<span data-test="mark">循環</span>' },
    })

    expect(wrapper.findAll('[data-test="mark"]')).toHaveLength(viewModel.nodes.file.length)
  })

  it('差し込む側は、どのノードの行かを受け取れる', async () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const wrapper = mount(SidebarPanel, {
      slots: {
        'file-badges': '<span :data-mark="node.id">•</span>',
        'method-badges': '<span :data-mark="node.id">•</span>',
      },
    })
    await openFileWithVaryingCounts(wrapper)

    const marked = wrapper.findAll('[data-mark]').map((el) => el.attributes('data-mark')!)
    const rows = wrapper.findAll('[data-node-id]').map((el) => el.attributes('data-node-id')!)

    expect(marked.sort()).toEqual(rows.sort())
  })
})
