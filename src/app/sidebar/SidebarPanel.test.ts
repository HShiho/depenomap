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

/** 検索に当たるが、所属ファイルの名前・パスには当たらないメソッド */
const methodOnlyHit = viewModel.nodes.method.find((method) => {
  const file = viewModel.nodeById.get(method.parent)!
  return (
    file.kind === 'file' &&
    !`${file.name} ${file.path}`.toLowerCase().includes(method.name.toLowerCase())
  )
})!

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

describe('検索（US-07 / UT-11）', () => {
  const typeQuery = async (wrapper: ReturnType<typeof setup>['wrapper'], query: string) => {
    await wrapper.find('input[type="search"]').setValue(query)
  }

  it('検索欄に名前を入れると、一覧が絞られる', async () => {
    const { wrapper } = setup()
    const before = shownFiles(wrapper).length

    await typeQuery(wrapper, 'Todo')

    const after = shownFiles(wrapper)
    expect(after.length).toBeGreaterThan(0)
    expect(after.length).toBeLessThan(before)
  })

  it('検索語は器が持つ（UT-05）', async () => {
    const { state, wrapper } = setup()
    await typeQuery(wrapper, 'Todo')

    expect(state.query).toBe('Todo')
  })

  it('検索語を消すと、絞り込み前に戻る', async () => {
    const { wrapper } = setup()
    const before = shownFiles(wrapper)

    await typeQuery(wrapper, 'Todo')
    await typeQuery(wrapper, '')

    expect(shownFiles(wrapper)).toEqual(before)
  })

  it('ディレクトリ名でも絞れる（同じ入力欄）', async () => {
    const { wrapper } = setup()
    await typeQuery(wrapper, 'src/domain/')

    const kept = shownFiles(wrapper).map((id) => viewModel.nodeById.get(id)!)
    expect(kept.length).toBeGreaterThan(0)
    for (const node of kept) expect(node.kind === 'file' && node.path).toContain('src/domain/')
  })

  it('大文字小文字を区別しない', async () => {
    const { wrapper } = setup()
    await typeQuery(wrapper, 'todo')
    const lower = shownFiles(wrapper)

    await typeQuery(wrapper, 'TODO')
    expect(shownFiles(wrapper)).toEqual(lower)
  })

  it('絞ったあとの行からも、そのノードを選べる', async () => {
    // 検索結果から目的のノードへ到達できる（US-07）
    const { state, wrapper } = setup()
    await typeQuery(wrapper, 'Todo')

    const first = shownFiles(wrapper)[0]!
    await wrapper.find(`[data-node-id="${first}"]`).trigger('click')

    expect(state.selectedNodeId).toBe(first)
  })

  it('検索に名前を与える', () => {
    const { wrapper } = setup()
    const id = wrapper.find('input[type="search"]').attributes('id')

    expect(wrapper.find(`label[for="${id}"]`).text()).toBe('検索')
  })
})

describe('件数（UT-11）', () => {
  it('絞っていないときは全体の数', () => {
    const { wrapper } = setup()

    expect(wrapper.text()).toContain(`${viewModel.nodes.file.length} ファイル`)
  })

  it('絞ると「出ている数 / 全体」になる', async () => {
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue('Todo')

    const shown = shownFiles(wrapper).length
    expect(shown).toBeLessThan(viewModel.nodes.file.length)
    expect(wrapper.text()).toContain(`${shown} / ${viewModel.nodes.file.length} ファイル`)
  })

  it('件数に上限を設けない。出ている数と一覧の行数が一致する', async () => {
    // 途中で打ち切ると、出ていないのか隠されているのかが読み手に分からない
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue('o')

    const shown = shownFiles(wrapper).length
    expect(shown).toBeGreaterThan(10)
    expect(wrapper.text()).toContain(`${shown} / ${viewModel.nodes.file.length} ファイル`)
  })
})

describe('一致したメソッドの見せ方（UT-11）', () => {
  const methodOnly = methodOnlyHit

  it('メソッドが当たったファイルは、開いた状態で出る', async () => {
    // 閉じたまま出しても、なぜその行が残っているのか読めない
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue(methodOnly.name)

    expect(wrapper.find(`[data-node-id="${methodOnly.id}"]`).exists()).toBe(true)
  })

  it('当たったメソッドだけが並ぶ', async () => {
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue(methodOnly.name)

    const shown = wrapper
      .findAll('[data-node-id]')
      .map((row) => row.attributes('data-node-id')!)
      .filter((id) => id.startsWith('method:'))

    expect(shown.length).toBeGreaterThan(0)
    for (const id of shown) {
      const node = viewModel.nodeById.get(id)!
      expect(node.name.toLowerCase()).toContain(methodOnly.name.toLowerCase())
    }
  })

  it('検索で開いた行は閉じられない。理由も出す', async () => {
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue(methodOnly.name)

    const caret = wrapper
      .find(`[data-node-id="${methodOnly.parent}"]`)
      .element.parentElement!.querySelector('[aria-expanded]')!
    expect(caret.getAttribute('aria-disabled')).toBe('true')
    expect(caret.getAttribute('aria-label')).toBe(
      `${viewModel.nodeById.get(methodOnly.parent)!.name} は検索に一致したメソッドを含むため閉じられない`,
    )
  })

  it('検索語を消すと、また閉じる', async () => {
    // 検索で開いたのだから、検索語を消せば閉じてほしい
    const { wrapper } = setup()
    const search = wrapper.find('input[type="search"]')

    await search.setValue(methodOnly.name)
    await search.setValue('')

    const caret = wrapper
      .find(`[data-node-id="${methodOnly.parent}"]`)
      .element.parentElement!.querySelector('[aria-expanded]')!
    expect(caret.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('当たらなかったとき（N-1）', () => {
  it('該当なしと、何を探したかを出す', async () => {
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue('どこにも無い文字列')

    expect(shownFiles(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('該当なし')
    expect(wrapper.text()).toContain('どこにも無い文字列')
    expect(wrapper.text()).toContain(`0 / ${viewModel.nodes.file.length} ファイル`)
  })

  it('欠陥として扱わない。警告の見た目にしない', async () => {
    // 当たらなかったのは、そういう名前が無いだけ
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue('どこにも無い文字列')

    for (const word of ['エラー', '警告', '失敗', '不正']) {
      expect(wrapper.text()).not.toContain(word)
    }
    expect(wrapper.html()).not.toContain('warn')
  })

  it('絞っていないときは、該当なしを出さない', () => {
    const { wrapper } = setup()

    expect(wrapper.text()).not.toContain('該当なし')
  })
})

describe('残っている理由（UT-11）', () => {
  const badgesIn = (wrapper: ReturnType<typeof setup>['wrapper'], nodeId: string) =>
    wrapper.find(`[data-node-id="${nodeId}"]`).element.parentElement!.textContent ?? ''

  it('パスにだけ当たった行には、パスの印が出る', async () => {
    // 名前を見ても、なぜ残っているのか読めない
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue('src/infra/')

    const byPath = shownFiles(wrapper).filter((id) => {
      const node = viewModel.nodeById.get(id)!
      return node.kind === 'file' && !node.name.toLowerCase().includes('src/infra/')
    })

    expect(byPath.length).toBeGreaterThan(0)
    for (const id of byPath) expect(badgesIn(wrapper, id)).toContain('パス')
  })

  it('名前に当たった行には、印を付けない', async () => {
    // 付けると「当たり方の良し悪し」に見える（N-1）
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue('Todo')

    const byName = shownFiles(wrapper).filter((id) => {
      const node = viewModel.nodeById.get(id)!
      return node.kind === 'file' && node.name.toLowerCase().includes('todo')
    })

    expect(byName.length).toBeGreaterThan(0)
    for (const id of byName) expect(badgesIn(wrapper, id)).not.toContain('パス')
  })

  it('絞っていないときは、印を出さない', () => {
    // 並べ替えの選択肢にも「パス順」があるので、行の中だけを見る
    const { wrapper } = setup()

    for (const id of shownFiles(wrapper)) expect(badgesIn(wrapper, id)).not.toContain('パス')
  })
})

describe('検索と並べ替えの計算（UT-11）', () => {
  it('打鍵のたびに、一覧を並べ直さない', async () => {
    // 行ごとの引き当てを組み立てのときに済ませてある意味が、検索のたびに消える
    const spy = vi.spyOn(viewModel, 'fanInOf')
    try {
      const { wrapper } = setup()
      const search = wrapper.find('input[type="search"]')
      await search.setValue('T')
      const after = spy.mock.calls.length

      await search.setValue('To')
      await search.setValue('Tod')
      await search.setValue('Todo')

      expect(spy.mock.calls.length).toBe(after)
    } finally {
      spy.mockRestore()
    }
  })

  it('並べ替えを変えたときは、並べ直す', async () => {
    const { wrapper } = setup()
    const spy = vi.spyOn(viewModel, 'fanInOf')
    try {
      await wrapper.find('select').setValue('fan-in')

      expect(spy.mock.calls.length).toBeGreaterThan(0)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('粒度と検索（ADR-003）', () => {
  it('粒度を切り替えても、同じ検索語で同じ行が出る', async () => {
    /*
     * 「現在の表示粒度に関わらず、検索対象は全ノード」。一覧が粒度で中身を
     * 変えない（UT-12 の決定）ことと合わせて、ここが崩れるとメソッドへ
     * 辿り着く道が粒度によって消える
     */
    const { state, wrapper } = setup()
    const search = wrapper.find('input[type="search"]')

    state.setGranularity('file')
    await search.setValue(methodOnlyHit.name)
    const inFile = wrapper.findAll('[data-node-id]').map((row) => row.attributes('data-node-id')!)

    state.setGranularity('method')
    await wrapper.vm.$nextTick()
    const inMethod = wrapper.findAll('[data-node-id]').map((row) => row.attributes('data-node-id')!)

    expect(inFile.some((id) => id.startsWith('method:'))).toBe(true)
    expect(inMethod).toEqual(inFile)
  })
})

describe('結果の変化の知らせ方（UT-11）', () => {
  it('件数は読み上げに流れる場所に置く', async () => {
    /*
     * 入力してもフォーカスは入力欄に留まる。一覧の変化そのものは読まれないので、
     * 入力に応じて変わる件数が唯一の知らせになる
     */
    const { wrapper } = setup()
    const status = wrapper.find('[role="status"]')

    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('ファイル')

    await wrapper.find('input[type="search"]').setValue('Todo')
    expect(wrapper.find('[role="status"]').text()).toContain('/')
  })

  it('該当なしのときも、件数から 0 件だと分かる', async () => {
    const { wrapper } = setup()
    await wrapper.find('input[type="search"]').setValue('どこにも無い文字列')

    expect(wrapper.find('[role="status"]').text()).toBe(
      `0 / ${viewModel.nodes.file.length} ファイル`,
    )
  })
})
