import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

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
  if (options.withGraph !== false) state.setGraph(viewModel)
  return state
}

beforeEach(() => setActivePinia(createPinia()))

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
    state.narrowedToSelection = true

    state.clearSelection()

    expect(state.narrowedToSelection).toBe(false)
  })
})

describe('粒度の切り替え', () => {
  it('メソッドを選んだままファイル粒度へ行くと、所属ファイルへ読み替える', () => {
    const state = setup()
    state.granularity = 'method'
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
    state.granularity = 'method'
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
    state.granularity = 'method'
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
    state.granularity = 'method'
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

    // 後続のテストへ持ち越さない（記憶は UT-04 側にある）
    state.selectTheme('system')
  })
})

describe('グラフの入れ替え', () => {
  it('グラフを落とすと、そのグラフを指していた状態も落ちる', () => {
    const state = setup()
    state.select(someFile.id)
    state.narrowedToSelection = true

    state.setGraph(undefined)

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
