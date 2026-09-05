import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { checkIntegrity, MAX_VIOLATIONS_PER_KIND, REFERENCE_KINDS } from './integrity'
import { DependencyGraphSchema, type DependencyGraph } from './schema'

const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)
const fixture: unknown = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'))

/** フィクスチャを壊さずに、書き換えた複製を得る */
function graphOf(mutate?: (g: DependencyGraph) => void): DependencyGraph {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return graph
}

describe('checkIntegrity', () => {
  it('正常なフィクスチャは違反ゼロ', () => {
    const report = checkIntegrity(graphOf())

    expect(report.total).toBe(0)
    expect(report.violations).toHaveLength(0)
    expect(report.truncated).toBe(false)
  })

  it('全 7 種別の総件数を必ず返す', () => {
    const report = checkIntegrity(graphOf())

    expect(Object.keys(report.totals).sort()).toEqual([...REFERENCE_KINDS].sort())
  })
})

describe('参照元ごとの検出', () => {
  it('edges[].from が実在しない ID を指すと検出する', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.edges[0]!.from = 'file:src/存在しない.ts'
      }),
    )

    expect(report.total).toBe(1)
    expect(report.violations[0]).toEqual({
      kind: 'edges.from',
      at: 'e_0001',
      missing: 'file:src/存在しない.ts',
    })
  })

  it('nodes[].parent が外れると検出する', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const method = g.nodes.find((n) => n.kind === 'method')!
        if (method.kind === 'method') method.parent = 'file:src/無い.ts'
      }),
    )

    expect(report.totals['nodes.parent']).toBe(1)
  })

  it('cycles[].edges はエッジ ID の実在を見る', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.cycles[0]!.edges = ['e_9999']
      }),
    )

    expect(report.totals['cycles.edges']).toBe(1)
    expect(report.violations[0]?.missing).toBe('e_9999')
  })

  it('unresolved[].candidates も検査対象', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.unresolved[0]!.candidates = ['method:src/無い.ts#A.b']
      }),
    )

    expect(report.totals['unresolved.candidates']).toBe(1)
  })
})

describe('打ち切り', () => {
  it('種別ごとに上限まで返し、総件数は実数のまま', () => {
    const broken = MAX_VIOLATIONS_PER_KIND + 5
    const report = checkIntegrity(
      graphOf((g) => {
        for (let i = 0; i < broken; i += 1) g.edges[i]!.from = `file:src/無い${i}.ts`
      }),
    )

    expect(report.violations).toHaveLength(MAX_VIOLATIONS_PER_KIND)
    expect(report.totals['edges.from']).toBe(broken)
    expect(report.truncated).toBe(true)
  })

  it('一方の種別が上限を超えても、他方の 1 件が埋もれない', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        for (let i = 0; i < 50; i += 1) g.edges[i]!.from = `file:src/無い${i}.ts`
        g.cycles[0]!.edges = ['e_9999']
      }),
    )

    const kinds = new Set(report.violations.map((x) => x.kind))
    expect(kinds).toContain('edges.from')
    expect(kinds).toContain('cycles.edges')
    expect(report.totals['edges.from']).toBe(50)
    expect(report.totals['cycles.edges']).toBe(1)
  })
})
