import { describe, expect, it, vi } from 'vitest'

import { fetchGraph, fetchLocate, GRAPH_ENDPOINT, LOCATE_ENDPOINT } from './api'
import type { LoadResult } from './loader'

const loaded: LoadResult = {
  ok: false,
  errors: [{ type: 'read-failed', path: '/srv/graph.json', message: 'ENOENT' }],
  warnings: [],
}

function respondWith(body: unknown, init?: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), init)) as unknown as typeof fetch
}

describe('fetchGraph', () => {
  it('口に届けば、読み込み結果をそのまま渡す', async () => {
    const outcome = await fetchGraph(respondWith(loaded))

    expect(outcome.reached).toBe(true)
    if (!outcome.reached) return
    expect(outcome.result).toEqual(loaded)
  })

  it('決められた場所を叩く', async () => {
    const fetchImpl = respondWith(loaded)
    await fetchGraph(fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith(GRAPH_ENDPOINT)
  })

  it('サーバーに届かなければ、読み込みの失敗と区別して返す', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Failed to fetch')
    }) as unknown as typeof fetch

    const outcome = await fetchGraph(fetchImpl)

    expect(outcome.reached).toBe(false)
    if (outcome.reached) return
    expect(outcome.message).toContain('Failed to fetch')
  })

  it('非 200 は口に届いていないものとして扱う', async () => {
    const outcome = await fetchGraph(respondWith({}, { status: 404 }))

    expect(outcome.reached).toBe(false)
    if (outcome.reached) return
    expect(outcome.message).toContain('404')
  })

  it('JSON として読めない応答も、届いていないものとして扱う', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html></html>')) as unknown as typeof fetch

    const outcome = await fetchGraph(fetchImpl)

    expect(outcome.reached).toBe(false)
  })
})

describe('fetchLocate', () => {
  it('口に届けば、解決の結果をそのまま渡す', async () => {
    const located = { resolved: true, hostPath: '/Users/me/app/src/a.ts', exists: true }

    const outcome = await fetchLocate('src/a.ts', respondWith(located))

    expect(outcome).toEqual({ reached: true, result: located })
  })

  it('解決できなかったことは、届いた結果として渡す', async () => {
    // 図を読むだけならリポジトリは要らない。欠陥ではない（N-1）
    const outcome = await fetchLocate(
      'src/a.ts',
      respondWith({ resolved: false, reason: 'no-repo' }),
    )

    expect(outcome).toEqual({ reached: true, result: { resolved: false, reason: 'no-repo' } })
  })

  it('相対パスを符号化して渡す', async () => {
    // クエリの `+` は復号すると空白になる。素のまま繋ぐと別のファイルを指す
    const fetchImpl = respondWith({ resolved: false, reason: 'no-repo' })

    await fetchLocate('src/a+b.ts', fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith(`${LOCATE_ENDPOINT}?path=src%2Fa%2Bb.ts`)
  })

  it('サーバーに届かなければ、解決の失敗と区別して返す', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error('ECONNREFUSED')),
    ) as unknown as typeof fetch

    expect(await fetchLocate('src/a.ts', fetchImpl)).toEqual({
      reached: false,
      message: 'ECONNREFUSED',
    })
  })

  it('非 200 は口に届いていないものとして扱う', async () => {
    const outcome = await fetchLocate('src/a.ts', respondWith({}, { status: 404 }))

    expect(outcome.reached).toBe(false)
  })

  it('JSON として読めない応答も、届いていないものとして扱う', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>')) as unknown as typeof fetch

    expect((await fetchLocate('src/a.ts', fetchImpl)).reached).toBe(false)
  })
})
