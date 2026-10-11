import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONFIG_ENDPOINT } from '@/core/graph/api'
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

describe('読み込み直し', () => {
  const failing = respondWith({
    ok: false,
    errors: [{ type: 'read-failed', path: '/x', message: 'ENOENT' }],
    warnings: [],
  })

  it('2 回目が失敗したら、前回のグラフを残さない', async () => {
    const state = useViewState()
    await loadGraphInto(state, respondWith({ ok: true, graph: fixture as never, warnings: [] }))

    await loadGraphInto(state, failing)

    expect(state.status).toEqual({ kind: 'invalid' })
    expect(state.viewModel).toBeUndefined()
  })

  it('サーバーに届かなくなったら、前回の理由と警告を残さない', async () => {
    const state = useViewState()
    await loadGraphInto(state, failing)

    const unreachable = vi.fn(async () => {
      throw new Error('Failed to fetch')
    }) as unknown as typeof fetch
    await loadGraphInto(state, unreachable)

    expect(state.status.kind).toBe('unreachable')
    expect(state.errors).toEqual([])
    expect(state.warnings).toEqual([])
  })
})

describe('想定していない失敗', () => {
  it('応答が読み込み結果の形でなくても、読み込み中のまま固まらない', async () => {
    const state = useViewState()
    // 取得の口は本文の形を検査しない（UT-03）。壊れた本文はここまで届く
    const nonsense = vi.fn(
      async () => new Response('{"ok":true,"graph":{},"warnings":[]}'),
    ) as unknown as typeof fetch

    await loadGraphInto(state, nonsense)

    expect(state.status.kind).toBe('broken')
  })

  it('本文が信用できないときは警告も載せない', async () => {
    const state = useViewState()
    const nonsense = vi.fn(
      async () =>
        new Response(
          '{"ok":true,"graph":{},"warnings":[{"type":"schema-version-differs","expected":"1.0.0","actual":"1.1.0"}]}',
        ),
    ) as unknown as typeof fetch

    await loadGraphInto(state, nonsense)

    expect(state.status.kind).toBe('broken')
    expect(state.warnings).toEqual([])
  })
})

describe('画面向けの設定（UT-31）', () => {
  /** 設定の口とグラフの口で応答を分ける */
  function routes(config: () => Promise<Response>): typeof fetch {
    return vi.fn((url: string) =>
      url === CONFIG_ENDPOINT
        ? config()
        : Promise.resolve(new Response(JSON.stringify({ ok: true, graph: fixture, warnings: [] }))),
    ) as unknown as typeof fetch
  }

  it('合成ルートの層を受け取り、グラフと照らし合わせる', async () => {
    const state = useViewState()
    await loadGraphInto(
      state,
      routes(async () => new Response(JSON.stringify({ compositionRootLayer: 'di' }))),
    )

    expect(state.compositionRoot.kind).toBe('present')
  })

  it('設定の口に届かなくても、グラフは読み込む', async () => {
    // 設定は図を読むのに必須ではない
    const state = useViewState()
    await loadGraphInto(
      state,
      routes(async () => {
        throw new Error('Failed to fetch')
      }),
    )

    expect(state.status.kind).toBe('ready')
    expect(state.compositionRoot).toEqual({ kind: 'unset' })
  })

  it('設定の形が違っても、層を指定されたものとして扱わない', async () => {
    const state = useViewState()
    await loadGraphInto(
      state,
      routes(async () => new Response(JSON.stringify({ compositionRootLayer: 42 }))),
    )

    expect(state.compositionRoot).toEqual({ kind: 'unset' })
  })

  it('読み直したときに指定が無くなっていれば、前の指定を残さない', async () => {
    const state = useViewState()
    await loadGraphInto(
      state,
      routes(async () => new Response(JSON.stringify({ compositionRootLayer: 'di' }))),
    )
    await loadGraphInto(
      state,
      routes(async () => new Response(JSON.stringify({ compositionRootLayer: null }))),
    )

    expect(state.compositionRoot).toEqual({ kind: 'unset' })
  })
})

describe('画面向けの設定の本文が壊れているとき（UT-31）', () => {
  it('本文が null でも、グラフは読み込む', async () => {
    const state = useViewState()
    const fetchImpl = vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          url === CONFIG_ENDPOINT
            ? 'null'
            : JSON.stringify({ ok: true, graph: fixture, warnings: [] }),
        ),
      ),
    ) as unknown as typeof fetch

    await loadGraphInto(state, fetchImpl)

    expect(state.status.kind).toBe('ready')
    expect(state.compositionRoot).toEqual({ kind: 'unset' })
  })
})
