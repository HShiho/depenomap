// @vitest-environment jsdom

/*
 * 好みを覚える経路（UT-29）だけを、記憶先のある環境で見る。
 *
 * `view-state.test.ts` は node 環境で走り、そこには `localStorage` が無い。
 * 器は掴めない環境でも壊れない作りなので、**同じファイルに置くと「覚えた」
 * ことを一度も確かめないまま通る**。
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { useViewState } from './view-state'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

beforeEach(() => setActivePinia(createPinia()))

describe('インターフェースを畳む好み（UT-29）', () => {
  /** `localStorage` は jsdom が持つ。検査ごとに空にする */
  beforeEach(() => localStorage.clear())

  it('グラフを読む前から、畳んでいない', () => {
    // 図が無いあいだに「畳んでいます」と言わない
    expect(useViewState().interfacesFolded).toBe(false)
  })

  it('既定は畳まない', () => {
    // 畳んだ状態で始めると、初見では interface の無いグラフに見える
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })

    expect(state.interfacesFolded).toBe(false)
  })

  it('畳むと、次に同じグラフを開いたときも畳んでいる', () => {
    // 同じリポジトリを繰り返し見る道具なので、毎起動戻るのは苦痛（ADR-006 と同じ扱い）
    const first = useViewState()
    first.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    first.setInterfacesFolded(true)

    setActivePinia(createPinia())
    const next = useViewState()
    next.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })

    expect(next.interfacesFolded).toBe(true)
  })

  it('別の解析対象のグラフには持ち込まない', () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    state.setInterfacesFolded(true)

    const elsewhere = buildViewModel({
      ...result.graph,
      meta: { ...result.graph.meta, rootDir: '/other/app' },
    })
    state.applyLoadOutcome({ kind: 'ready', viewModel: elsewhere, warnings: [] })

    expect(state.interfacesFolded).toBe(false)
  })

  it('読めなくなったら畳まない状態へ戻す', () => {
    // 図が無いあいだに「畳んでいます」と言わない
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    state.setInterfacesFolded(true)

    state.applyLoadOutcome({ kind: 'unreachable', message: 'ECONNREFUSED' })

    expect(state.interfacesFolded).toBe(false)
  })
})
