import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * W0（骨組み）の完了判定（ADR-005「実装方針」）。
 *
 * ツールチェーンが動くことと、正本 JSON を読めることだけを確認する。
 * スキーマへの適合検査は UT-01 の責務であり、ここでは行わない。
 * UT-01 の着手時に、本テストは Valibot による検証テストへ置き換える。
 */
const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)

describe('正本 JSON のフィクスチャ', () => {
  it('読み込めて、想定した規模を持つ', () => {
    const graph = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'))

    expect(graph.schemaVersion).toBe('1.0.0')
    expect(graph.layers).toHaveLength(6)
    expect(graph.nodes).toHaveLength(88)
    expect(graph.edges).toHaveLength(140)
    expect(graph.cycles).toHaveLength(5)
    expect(graph.unresolved).toHaveLength(5)
  })
})
