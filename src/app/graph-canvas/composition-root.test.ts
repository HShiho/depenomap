import { describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import {
  compositionRootNodeIds,
  compositionRootOf,
  hideStorageKey,
  readHidePreference,
  writeHidePreference,
} from './composition-root'
import type { FoldStorage } from './interface-fold'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

/** フィクスチャで合成ルートにあたる層 */
const DI = 'di'

function memory(initial: Record<string, string> = {}): FoldStorage & {
  store: Map<string, string>
} {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
  }
}

const forbidden: FoldStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('合成ルートの層の引き当て', () => {
  it('指定が無ければ、合成ルートは無い', () => {
    // ビューアは層 ID を決め打ちしない（ADR-002 / ADR-006）
    expect(compositionRootOf(viewModel, undefined)).toEqual({ kind: 'unset' })
  })

  it('正本 JSON の layers[] に在れば、その層の名前と一緒に返す', () => {
    const layer = result.graph.layers.find((candidate) => candidate.id === DI)!

    expect(compositionRootOf(viewModel, DI)).toEqual({
      kind: 'present',
      layerId: DI,
      name: layer.name,
    })
  })

  it('layers[] に無ければ、無いことを返す（推測で別の層に寄せない）', () => {
    expect(compositionRootOf(viewModel, 'Di')).toEqual({ kind: 'missing', layerId: 'Di' })
  })

  it('グラフが無いあいだは、照らし合わせない', () => {
    // 読み込み前に「無い」と言わない
    expect(compositionRootOf(undefined, DI)).toEqual({ kind: 'unset' })
  })
})

describe('隠すノード', () => {
  it('その粒度で、その層に属するノードだけ', () => {
    for (const granularity of ['file', 'method'] as const) {
      const ids = compositionRootNodeIds(viewModel, granularity, DI)
      const expected = viewModel.nodes[granularity]
        .filter((node) => viewModel.layerOf(node.id).key === DI)
        .map((node) => node.id)

      expect(ids, granularity).toEqual(new Set(expected))
      expect(ids.size, granularity).toBeGreaterThan(0)
    }
  })
})

describe('隠す好みの記憶', () => {
  const root = viewModel.meta.rootDir

  it('解析対象ごとに覚える', () => {
    expect(hideStorageKey('/a')).not.toBe(hideStorageKey('/b'))
  })

  it('覚えていなければ、隠さない', () => {
    // 隠した状態で始めると、初見では合成ルートの無いグラフに見える
    expect(readHidePreference(memory(), root)).toBe(false)
  })

  it('覚えたものを読み戻せる', () => {
    const storage = memory()
    writeHidePreference(storage, root, true)

    expect(readHidePreference(storage, root)).toBe(true)
  })

  it('隠さない状態は、鍵ごと消す', () => {
    // 既定と同じ値を書き残すと、あとで既定を変えたときに古い利用者だけ取り残される
    const storage = memory()
    writeHidePreference(storage, root, true)
    writeHidePreference(storage, root, false)

    expect(storage.store.size).toBe(0)
  })

  it('インターフェースを畳む好み（UT-29）とは別に覚える', () => {
    // 別の操作。1 つのトグルにまとめない（UT-29 / ADR-006）
    const storage = memory({ [`depenomap:fold-interfaces:${root}`]: 'true' })

    expect(readHidePreference(storage, root)).toBe(false)
  })

  it('記憶先が無くても、保存が禁止されていても壊れない', () => {
    expect(readHidePreference(undefined, root)).toBe(false)
    expect(readHidePreference(forbidden, root)).toBe(false)
    expect(() => writeHidePreference(forbidden, root, true)).not.toThrow()
  })
})
