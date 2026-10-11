// @vitest-environment jsdom

/*
 * 合成ルートの層を隠す（UT-31）経路を、記憶先のある環境で見る。
 * 理由は `view-state.fold.test.ts` と同じ（node 環境には `localStorage` が無い）。
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

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function ready() {
  const state = useViewState()
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  return state
}

describe('合成ルートの層（UT-31）', () => {
  it('指定が無ければ、合成ルートは無い', () => {
    expect(ready().compositionRoot).toEqual({ kind: 'unset' })
  })

  it('指定された層を、読み込んだグラフと照らし合わせる', () => {
    const state = ready()
    state.setCompositionRootLayer('di')

    expect(state.compositionRoot.kind).toBe('present')
  })

  it('グラフに無い層は、無いと分かる', () => {
    const state = ready()
    state.setCompositionRootLayer('nowhere')

    expect(state.compositionRoot).toEqual({ kind: 'missing', layerId: 'nowhere' })
  })

  it('設定はグラフを読み直しても残る', () => {
    // 設定は起動パラメータ由来で、グラフに由来しない
    const state = ready()
    state.setCompositionRootLayer('di')
    state.applyLoadOutcome({ kind: 'loading' })
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })

    expect(state.compositionRoot.kind).toBe('present')
  })
})

describe('隠す好み（UT-31 / ADR-006 決定 3）', () => {
  it('既定は隠さない', () => {
    expect(ready().compositionRootHidden).toBe(false)
  })

  it('隠すと、次に同じグラフを開いたときも隠している', () => {
    const first = ready()
    first.setCompositionRootHidden(true)

    setActivePinia(createPinia())
    expect(ready().compositionRootHidden).toBe(true)
  })

  it('別の解析対象のグラフには持ち込まない', () => {
    const state = ready()
    state.setCompositionRootHidden(true)

    const elsewhere = buildViewModel({
      ...result.graph,
      meta: { ...result.graph.meta, rootDir: '/somewhere/else' },
    })
    state.applyLoadOutcome({ kind: 'ready', viewModel: elsewhere, warnings: [] })

    expect(state.compositionRootHidden).toBe(false)
  })

  it('インターフェースを畳む好み（UT-29）とは別に持つ', () => {
    const state = ready()
    state.setCompositionRootHidden(true)

    expect(state.interfacesFolded).toBe(false)
  })
})
