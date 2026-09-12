import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { useViewState } from './view-state'

import fixture from '../../../test-data/dependency-graph.complex.json'

/** 実データの ViewModel。粒度の読み替えは実際の親子関係で確かめる */
function loadViewModel() {
  const result = loadGraphFromValue(fixture)
  if (!result.ok) throw new Error('フィクスチャが読めない')
  return buildViewModel(result.graph)
}

const viewModel = loadViewModel()
const someMethod = viewModel.nodes.method[0]!
const someFile = viewModel.nodes.file[0]!

function setup(options: { withGraph?: boolean } = {}) {
  setActivePinia(createPinia())
  const state = useViewState()
  if (options.withGraph !== false) {
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  }
  return state
}

beforeEach(() => setActivePinia(createPinia()))

/*
 * テーマのコントローラはモジュールに 1 つで、pinia を作り直しても共有される。
 * 後始末を `it` の末尾に置くと、手前の `expect` が落ちた時点で実行されず、
 * 次のテストへ選択が漏れる。失敗しても必ず戻す。
 */
afterEach(() => useViewState().selectTheme('system'))

describe('初期状態', () => {
  it('ファイル粒度・層の軸・選択なしから始まる', () => {
    const state = setup()

    expect(state.granularity).toBe('file')
    expect(state.columnAxis).toBe('layer')
    expect(state.selectedNodeId).toBeUndefined()
    expect(state.narrowedToSelection).toBe(false)
    expect(state.sidebarOpen).toBe(true)
  })
})

describe('選択と履歴', () => {
  it('選ぶと履歴に積まれる', () => {
    const state = setup()

    state.select('a')
    state.select('b')

    expect(state.selectedNodeId).toBe('b')
    expect(state.history.map((entry) => entry.nodeId)).toEqual(['a', 'b'])
    expect(state.canGoBack).toBe(true)
    expect(state.canGoForward).toBe(false)
  })

  it('同じノードを選び直しても積まない', () => {
    const state = setup()

    state.select('a')
    state.select('a')

    expect(state.history.map((entry) => entry.nodeId)).toEqual(['a'])
  })

  it('戻る・進むで選択が動く', () => {
    const state = setup()
    state.select('a')
    state.select('b')

    state.back()
    expect(state.selectedNodeId).toBe('a')
    expect(state.canGoForward).toBe(true)

    state.forward()
    expect(state.selectedNodeId).toBe('b')
  })

  it('戻ってから別のノードを選ぶと、進む先を捨てる', () => {
    const state = setup()
    state.select('a')
    state.select('b')
    state.back()

    state.select('c')

    expect(state.history.map((entry) => entry.nodeId)).toEqual(['a', 'c'])
    expect(state.canGoForward).toBe(false)
  })

  it('端では動かない', () => {
    const state = setup()
    state.select('a')

    state.back()
    state.back()
    expect(state.selectedNodeId).toBe('a')

    state.forward()
    expect(state.selectedNodeId).toBe('a')
  })

  it('選択を外しても履歴は消えない', () => {
    const state = setup()
    state.select('a')
    state.select('b')

    state.clearSelection()

    expect(state.selectedNodeId).toBeUndefined()
    expect(state.history.map((entry) => entry.nodeId)).toEqual(['a', 'b'])
    state.back()
    expect(state.selectedNodeId).toBe('a')
  })

  it('選択が無くなれば絞り込みも解ける', () => {
    const state = setup()
    state.select('a')
    state.setNarrowedToSelection(true)

    state.clearSelection()

    expect(state.narrowedToSelection).toBe(false)
  })
})

describe('粒度の切り替え', () => {
  it('メソッドを選んだままファイル粒度へ行くと、所属ファイルへ読み替える', () => {
    const state = setup()
    state.setGranularity('method')
    state.select(someMethod.id)

    state.setGranularity('file')

    expect(state.selectedNodeId).toBe(someMethod.parent)
  })

  it('ファイルを選んだままメソッド粒度へ行くと、選択を外す', () => {
    const state = setup()
    state.select(someFile.id)

    state.setGranularity('method')

    expect(state.selectedNodeId).toBeUndefined()
  })

  it('切り替えは移動ではないので、履歴に積まない', () => {
    const state = setup()
    state.setGranularity('method')
    state.select(someMethod.id)
    const before = [...state.history]

    state.setGranularity('file')

    expect(state.history).toEqual(before)
  })

  it('選んだノードが表示できない粒度なら、粒度を合わせる', () => {
    const state = setup()

    state.select(someMethod.id)

    expect(state.granularity).toBe('method')
  })

  it('粒度をまたいで戻っても、見えないノードが選ばれた状態にならない', () => {
    const state = setup()
    state.setGranularity('method')
    state.select(someMethod.id)
    state.setGranularity('file')
    state.select(someFile.id)

    state.back()

    expect(state.granularity).toBe('method')
    expect(state.selectedNode?.kind).toBe('method')
  })

  it('同じ粒度を指定しても選択を触らない', () => {
    const state = setup()
    state.select(someFile.id)

    state.setGranularity('file')

    expect(state.selectedNodeId).toBe(someFile.id)
  })

  it('グラフが無ければ、読み替えられない選択は外す', () => {
    const state = setup({ withGraph: false })
    state.setGranularity('method')
    state.select('どこかのメソッド')

    state.setGranularity('file')

    expect(state.selectedNodeId).toBeUndefined()
  })
})

describe('キャンバスの実寸', () => {
  it('描画側が読める形で持つ', () => {
    const state = setup()

    state.setCanvasSize(1280, 720)

    expect([state.canvasWidth, state.canvasHeight]).toEqual([1280, 720])
  })
})

describe('テーマ', () => {
  it('器から読み書きできる。値は UT-04 の口が持つ', () => {
    const state = setup()

    state.selectTheme('dark')
    expect(state.themeResolved).toBe('dark')
    expect(state.themeChoice).toBe('dark')

    state.toggleTheme()
    expect(state.themeResolved).toBe('light')
  })
})

describe('読み込み結果の反映', () => {
  it('状況と中身が同時に決まる', () => {
    const state = setup({ withGraph: false })

    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    expect([state.status.kind, state.viewModel !== undefined]).toEqual(['ready', true])

    state.applyLoadOutcome({ kind: 'unreachable', message: '届かない' })
    expect([state.status.kind, state.viewModel]).toEqual(['unreachable', undefined])
  })

  it('グラフを落とすと、そのグラフを指していた状態も落ちる', () => {
    const state = setup()
    state.select(someFile.id)
    state.setNarrowedToSelection(true)

    state.applyLoadOutcome({ kind: 'loading' })

    expect(state.selectedNodeId).toBeUndefined()
    expect(state.history).toEqual([])
    expect(state.narrowedToSelection).toBe(false)
  })
})

describe('器の分類', () => {
  it('読むだけの値は状態として登録しない', () => {
    const state = setup()

    // `$state` は「この器が持つ揮発する状態」。テーマの値は UT-04 が持つ
    expect(Object.keys(state.$state)).not.toContain('themeChoice')
    expect(Object.keys(state.$state)).not.toContain('themeResolved')
  })
})

describe('不変条件を持つ状態の書き込み', () => {
  it('アクションを通さない代入では変わらない。開発時は警告で気付ける', () => {
    const state = setup()
    state.select(someFile.id)
    // 型では通らない。実行時にも通らないことと、黙って落ちないことを固定する
    const writable = state as unknown as Record<string, unknown>
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      writable.granularity = 'method'
      writable.selectedNodeId = 'どこか'
      writable.historyIndex = 99

      expect(state.granularity).toBe('file')
      expect(state.selectedNodeId).toBe(someFile.id)
      expect(state.historyIndex).toBe(0)
      // 本番ビルドでは警告自体が落ちる。開発時に気付ける形であることを固定する
      expect(warn).toHaveBeenCalledTimes(3)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('選択に絞る', () => {
  it('選択があれば立てられる', () => {
    const state = setup()
    state.select(someFile.id)

    state.setNarrowedToSelection(true)

    expect(state.narrowedToSelection).toBe(true)
  })

  it('選択が無ければ立たない。絞る対象がない', () => {
    const state = setup()

    state.setNarrowedToSelection(true)

    expect(state.narrowedToSelection).toBe(false)
  })
})

describe('履歴の中身', () => {
  it('要素も読むだけ。すり替えられない', () => {
    const state = setup()
    state.select(someFile.id)
    const entries = state.history as unknown as { nodeId: string }[]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      entries[0]!.nodeId = 'すり替え'

      expect(state.history[0]!.nodeId).toBe(someFile.id)
      expect(warn).toHaveBeenCalledOnce()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('購読の仕方', () => {
  it('$state に残るのは不変条件を持たない値だけ', () => {
    const state = setup()

    // 選択や粒度は getter で公開しているため $state には無い。
    // 変化を待つ側は watch(() => state.selectedNodeId, …) を使う
    expect(Object.keys(state.$state).sort()).toEqual(['columnAxis', 'query', 'sidebarOpen'])
  })
})

describe('移動の経路（UT-14）', () => {
  it('移動すると、選択が移り絞り込みも立つ（US-12）', () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const target = viewModel.nodes.file[2]!

    state.moveTo(target.id)

    expect(state.selectedNodeId).toBe(target.id)
    expect(state.narrowedToSelection).toBe(true)
  })

  it('図の上で同じノードをもう一度押すと、絞り込みだけ解く', () => {
    // 図を広げて全体の中の位置を見る操作が、選び直しと同じ手つきでできる
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const target = viewModel.nodes.file[2]!

    state.moveTo(target.id, { toggle: true })
    state.moveTo(target.id, { toggle: true })

    expect(state.narrowedToSelection).toBe(false)
    expect(state.selectedNodeId).toBe(target.id)
  })

  it('図の上でさらにもう一度押すと、選択も外れる', () => {
    /*
     * 選択を外す口が無いと、深度軸では起点が選んだノードに固定されたまま
     * 戻れなくなる（ADR-001 の既定の起点へ帰れない）
     */
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const target = viewModel.nodes.file[2]!

    state.moveTo(target.id, { toggle: true })
    state.moveTo(target.id, { toggle: true })
    state.moveTo(target.id, { toggle: true })

    expect(state.selectedNodeId).toBeUndefined()
    expect(state.narrowedToSelection).toBe(false)
  })

  it('一覧や検索の行は、同じノードでも絞り込みを解かない', () => {
    // 行を押す意図は「この行を選ぶ」。押しただけで図の絞り込みが解けない
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const target = viewModel.nodes.file[2]!

    state.moveTo(target.id)
    state.moveTo(target.id)

    expect(state.narrowedToSelection).toBe(true)
  })

  it('外したあと選び直すと、また絞る', () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const target = viewModel.nodes.file[2]!

    state.moveTo(target.id, { toggle: true })
    state.moveTo(target.id, { toggle: true })
    state.moveTo(target.id, { toggle: true })
    state.moveTo(target.id, { toggle: true })

    expect(state.selectedNodeId).toBe(target.id)
    expect(state.narrowedToSelection).toBe(true)
  })

  it('別のノードへ移動すると、そちらを中心に絞り直す', () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const first = viewModel.nodes.file[2]!
    const second = viewModel.nodes.file[3]!

    state.moveTo(first.id)
    state.moveTo(second.id)

    expect(state.selectedNodeId).toBe(second.id)
    expect(state.narrowedToSelection).toBe(true)
  })

  it('移動は履歴に積まれる（UT-15 の 1 手）', () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const first = viewModel.nodes.file[2]!
    const second = viewModel.nodes.file[3]!

    state.moveTo(first.id)
    state.moveTo(second.id)
    state.moveTo(second.id, { toggle: true })

    // 絞り込みの解除は「移動」ではないので積まない
    expect(state.history.map((entry) => entry.nodeId)).toEqual([first.id, second.id])
  })

  it('メソッドへ移動すると、粒度のほうが合う（UT-05 の規則）', () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    const method = viewModel.nodes.method[0]!

    state.moveTo(method.id)

    expect(state.granularity).toBe('method')
    expect(state.narrowedToSelection).toBe(true)
  })
})

describe('解除の出どころ（UT-14）', () => {
  const ready = () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    return state
  }

  it('Esc や ✕ で解いたあと同じノードを押すと、絞り直す', () => {
    // 絞り直すつもりの押下で、選択ごと失わない
    const state = ready()
    const target = viewModel.nodes.file[2]!

    state.moveTo(target.id, { toggle: true })
    state.setNarrowedToSelection(false)
    state.moveTo(target.id, { toggle: true })

    expect(state.selectedNodeId).toBe(target.id)
    expect(state.narrowedToSelection).toBe(true)
  })

  it('押して解いたあと続けて押したときだけ、選択も外す', () => {
    const state = ready()
    const target = viewModel.nodes.file[2]!

    state.moveTo(target.id, { toggle: true })
    state.moveTo(target.id, { toggle: true })
    state.moveTo(target.id, { toggle: true })

    expect(state.selectedNodeId).toBeUndefined()
  })

  it('間に別のノードを挟むと、2 段目にはならない', () => {
    const state = ready()
    const first = viewModel.nodes.file[2]!
    const other = viewModel.nodes.file[3]!

    state.moveTo(first.id, { toggle: true })
    state.moveTo(first.id, { toggle: true })
    state.moveTo(other.id, { toggle: true })
    state.moveTo(first.id, { toggle: true })

    expect(state.selectedNodeId).toBe(first.id)
    expect(state.narrowedToSelection).toBe(true)
  })
})
