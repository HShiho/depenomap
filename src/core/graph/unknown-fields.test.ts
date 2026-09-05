import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { findUnknownFields, MAX_UNKNOWN_FIELD_KINDS } from './unknown-fields'

const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)
const fixture = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8')) as Record<
  string,
  unknown
>

/** フィクスチャを壊さずに書き換えた複製を得る */
function rawOf(mutate?: (g: Record<string, unknown>) => void): Record<string, unknown> {
  const raw = structuredClone(fixture)
  mutate?.(raw)
  return raw
}

describe('findUnknownFields', () => {
  it('そのままのフィクスチャには未知フィールドが無い', () => {
    const report = findUnknownFields(rawOf())

    expect(report.fields).toHaveLength(0)
    expect(report.totalKinds).toBe(0)
    expect(report.truncated).toBe(false)
  })

  it('トップレベルの未知フィールドを見つける', () => {
    const report = findUnknownFields(rawOf((g) => (g.futureSection = [])))

    expect(report.fields).toEqual([{ path: 'futureSection', count: 1, example: 'futureSection' }])
  })

  it('入れ子（meta.snapshot）も辿る', () => {
    const report = findUnknownFields(
      rawOf((g) => {
        const meta = g.meta as { snapshot: Record<string, unknown> }
        meta.snapshot.tag = 'v1'
      }),
    )

    expect(report.fields[0]?.path).toBe('meta.snapshot.tag')
  })
})

describe('配列の畳み込み', () => {
  it('同じフィールドの繰り返しを 1 件に畳み、件数と例示パスを添える', () => {
    const report = findUnknownFields(
      rawOf((g) => {
        const nodes = g.nodes as Record<string, unknown>[]
        for (const node of nodes) if (node.kind === 'method') node.exported = true
      }),
    )

    expect(report.fields).toHaveLength(1)
    expect(report.fields[0]).toMatchObject({ path: 'nodes[].exported', count: 60 })
    expect(report.fields[0]?.example).toMatch(/^nodes\[\d+\]\.exported$/)
  })

  it('異なるフィールドは、件数が偏っても両方見える', () => {
    const report = findUnknownFields(
      rawOf((g) => {
        const nodes = g.nodes as Record<string, unknown>[]
        for (const node of nodes) node.exported = true
        ;(g.meta as Record<string, unknown>).newThing = 1
      }),
    )

    const paths = report.fields.map((f) => f.path)
    expect(paths).toContain('nodes[].exported')
    expect(paths).toContain('meta.newThing')
  })
})

describe('variant の枝選択', () => {
  it('file ノードに付いた未知フィールドを、file の枝で判定する', () => {
    const report = findUnknownFields(
      rawOf((g) => {
        const nodes = g.nodes as Record<string, unknown>[]
        nodes.find((n) => n.kind === 'file')!.exported = true
      }),
    )

    expect(report.fields[0]).toMatchObject({ path: 'nodes[].exported', count: 1 })
  })

  it('import エッジ固有の specifier を call エッジに付けると未知として拾う', () => {
    const report = findUnknownFields(
      rawOf((g) => {
        const edges = g.edges as Record<string, unknown>[]
        edges.find((e) => e.kind === 'call')!.specifier = './x'
      }),
    )

    expect(report.fields[0]).toMatchObject({ path: 'edges[].specifier', count: 1 })
  })

  it('import エッジ本来の specifier は未知にしない', () => {
    const report = findUnknownFields(rawOf())

    expect(report.fields.map((f) => f.path)).not.toContain('edges[].specifier')
  })
})

describe('打ち切り', () => {
  it('種類が上限を超えると切るが、総種類数は実数のまま', () => {
    const extra = MAX_UNKNOWN_FIELD_KINDS + 3
    const report = findUnknownFields(
      rawOf((g) => {
        for (let i = 0; i < extra; i += 1) g[`extra${i}`] = i
      }),
    )

    expect(report.fields).toHaveLength(MAX_UNKNOWN_FIELD_KINDS)
    expect(report.totalKinds).toBe(extra)
    expect(report.truncated).toBe(true)
  })
})
