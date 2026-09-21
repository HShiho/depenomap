import { describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import {
  foldStorageKey,
  interfaceMethodIds,
  readFoldPreference,
  writeFoldPreference,
  type FoldStorage,
} from './interface-fold'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

/** その場だけの記憶先。実装と同じ形（`Storage` の一部）で受ける */
function memory(
  initial: Record<string, string> = {},
): FoldStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
  }
}

/** 読むだけで投げる記憶先（保存が禁止されている環境） */
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

describe('畳む対象（UT-29 / UT-07）', () => {
  it('正本 JSON が interface と言っているメソッドだけを対象にする', () => {
    const ids = interfaceMethodIds(viewModel)
    expect(ids.size).toBeGreaterThan(0)

    for (const id of ids) {
      const node = viewModel.nodeById.get(id)
      expect(node?.kind === 'method' && node.ownerKind).toBe('interface')
    }
  })

  it('クラスのメソッドとトップレベル関数は対象にしない', () => {
    // 判定はビューアの推測ではなく、正本の値だけで決まる
    const ids = interfaceMethodIds(viewModel)
    const others = viewModel.nodes.method.filter(
      (node) => node.kind === 'method' && node.ownerKind !== 'interface',
    )
    expect(others.length).toBeGreaterThan(0)

    for (const node of others) expect(ids.has(node.id)).toBe(false)
  })

  it('ファイルノードは 1 件も入らない', () => {
    // ファイル粒度の import は実際の依存であり、畳むと事実が消える（UT-29 の決定）
    const ids = interfaceMethodIds(viewModel)

    for (const node of viewModel.nodes.file) expect(ids.has(node.id)).toBe(false)
  })
})

describe('畳んだ状態の記憶（UT-29 / ADR-006 と同じ扱い）', () => {
  it('解析対象ごとに覚える', () => {
    // 別のリポジトリのグラフを開いたときに、前の判断を持ち込まない
    expect(foldStorageKey('/a/app')).not.toBe(foldStorageKey('/b/app'))
  })

  it('覚えていなければ、畳まない', () => {
    expect(readFoldPreference(memory(), '/a/app')).toBe(false)
  })

  it('覚えたものを読み戻せる', () => {
    const storage = memory()
    writeFoldPreference(storage, '/a/app', true)

    expect(readFoldPreference(storage, '/a/app')).toBe(true)
  })

  it('畳まない状態は、鍵ごと消す', () => {
    /*
     * 既定と同じ値を書き残すと、あとで既定を変えたときに、古い利用者だけが
     * 前の既定のまま残る
     */
    const storage = memory()
    writeFoldPreference(storage, '/a/app', true)
    writeFoldPreference(storage, '/a/app', false)

    expect(storage.store.has(foldStorageKey('/a/app'))).toBe(false)
  })

  it('別の解析対象の記憶を読まない', () => {
    const storage = memory()
    writeFoldPreference(storage, '/a/app', true)

    expect(readFoldPreference(storage, '/b/app')).toBe(false)
  })

  it('記憶先が無くても成立する', () => {
    // SSR やテストでは `localStorage` が無い
    expect(readFoldPreference(undefined, '/a/app')).toBe(false)
    expect(() => writeFoldPreference(undefined, '/a/app', true)).not.toThrow()
  })

  it('保存が禁止されていても、畳む操作そのものは壊さない', () => {
    // 覚えられないだけ。読み書きで投げる環境がある
    expect(readFoldPreference(forbidden, '/a/app')).toBe(false)
    expect(() => writeFoldPreference(forbidden, '/a/app', true)).not.toThrow()
  })
})
