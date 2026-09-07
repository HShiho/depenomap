import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LoadResult } from '@/core/graph/loader'
import { loadGraphInto } from './graph-source'
import { useViewState } from './view-state'

import fixture from '../../../test-data/dependency-graph.complex.json'

/** 応答を返すだけの fetch。取得の口（UT-03）の検査は UT-03 側にある */
function respondWith(body: LoadResult): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch
}

beforeEach(() => setActivePinia(createPinia()))

describe('グラフを状態へ載せる', () => {
  it('読み込めたら ViewModel を持つ', async () => {
    const state = useViewState()

    await loadGraphInto(state, respondWith({ ok: true, graph: fixture as never, warnings: [] }))

    expect(state.status).toEqual({ kind: 'ready' })
    expect(state.viewModel?.nodes.file.length).toBeGreaterThan(0)
    expect(state.errors).toEqual([])
  })

  it('サーバーに届かなければ、その理由を持つ', async () => {
    const state = useViewState()
    const unreachable = vi.fn(async () => {
      throw new Error('Failed to fetch')
    }) as unknown as typeof fetch

    await loadGraphInto(state, unreachable)

    expect(state.status.kind).toBe('unreachable')
    expect(state.viewModel).toBeUndefined()
  })

  it('読み込めなければ理由の種別を持つ。ViewModel は持たない', async () => {
    const state = useViewState()

    await loadGraphInto(
      state,
      respondWith({
        ok: false,
        errors: [{ type: 'read-failed', path: '/srv/graph.json', message: 'ENOENT' }],
        warnings: [],
      }),
    )

    expect(state.status).toEqual({ kind: 'invalid' })
    // 種別に潰さず、どのファイルの何が起きたかを持ったまま運ぶ
    expect(state.errors).toEqual([
      { type: 'read-failed', path: '/srv/graph.json', message: 'ENOENT' },
    ])
    expect(state.viewModel).toBeUndefined()
  })

  it('警告は成否によらず載せる', async () => {
    const warning = { type: 'schema-version-differs', expected: '1.0.0', actual: '1.1.0' } as const

    const failed = useViewState()
    await loadGraphInto(
      failed,
      respondWith({
        ok: false,
        errors: [{ type: 'read-failed', path: '/x', message: 'ENOENT' }],
        warnings: [warning],
      }),
    )
    expect(failed.warnings).toEqual([warning])

    setActivePinia(createPinia())
    const loaded = useViewState()
    await loadGraphInto(
      loaded,
      respondWith({ ok: true, graph: fixture as never, warnings: [warning] }),
    )
    expect(loaded.warnings).toEqual([warning])
  })
})
