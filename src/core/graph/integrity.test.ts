import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import {
  checkIntegrity,
  MAX_VIOLATIONS_PER_KIND,
  VIOLATION_KINDS,
  type ViolationKind,
} from './integrity'
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

  it('全種別の総件数を必ず返す', () => {
    const report = checkIntegrity(graphOf())

    expect(Object.keys(report.totals).sort()).toEqual([...VIOLATION_KINDS].sort())
  })
})

describe('全種別の検出（テーブル駆動）', () => {
  /** 種別ごとに、その種別だけを 1 件壊す操作 */
  const breakers: Record<ViolationKind, (g: DependencyGraph) => void> = {
    'edges[].from': (g) => void (g.edges[0]!.from = 'file:src/無い.ts'),
    'edges[].to': (g) => void (g.edges[0]!.to = 'file:src/無い.ts'),
    'edges[].implementations[]': (g) => {
      const edge = g.edges.find((e) => e.kind === 'call' && e.implementations?.length)!
      if (edge.kind === 'call') edge.implementations = ['method:src/無い.ts#A.b']
    },
    'nodes[].parent': (g) => {
      const method = g.nodes.find((n) => n.kind === 'method')!
      if (method.kind === 'method') method.parent = 'file:src/無い.ts'
    },
    'cycles[].nodes[]': (g) => void (g.cycles[0]!.nodes = ['file:src/無い.ts']),
    'cycles[].edges[]': (g) => void (g.cycles[0]!.edges = ['e_9999']),
    'unresolved[].from': (g) => void (g.unresolved[0]!.from = 'method:src/無い.ts#A.b'),
    'unresolved[].candidates[]': (g) =>
      void (g.unresolved[0]!.candidates = ['method:src/無い.ts#A.b']),
    'nodes[].id': (g) => void (g.nodes[1]!.id = g.nodes[0]!.id),
    'edges[].id': (g) => void (g.edges[1]!.id = g.edges[0]!.id),
    'cycles[].id': (g) => void (g.cycles[1]!.id = g.cycles[0]!.id),
    'unresolved[].id': (g) => void (g.unresolved[1]!.id = g.unresolved[0]!.id),
    'nodes[].layer': (g) => void (g.nodes[0]!.layer = 'ghost'),
    'layers[].id': (g) => void (g.layers[1]!.id = g.layers[0]!.id),
  }

  it.each(VIOLATION_KINDS)('%s を検出する', (kind) => {
    const report = checkIntegrity(graphOf(breakers[kind]))

    expect(report.totals[kind]).toBeGreaterThan(0)
    expect(report.violations.some((x) => x.kind === kind)).toBe(true)
  })
})

describe('参照先のノード種別', () => {
  /** file / method のノード ID をそれぞれ 1 つ得る */
  const anyFile = (g: DependencyGraph) => g.nodes.find((n) => n.kind === 'file')!.id
  const anyMethod = (g: DependencyGraph) => g.nodes.find((n) => n.kind === 'method')!.id

  it('nodes[].parent がメソッドを指すと wrong-kind', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const method = g.nodes.find((n) => n.kind === 'method')!
        if (method.kind === 'method') method.parent = anyMethod(g)
      }),
    )

    const hit = report.violations.find((x) => x.kind === 'nodes[].parent')
    expect(hit).toMatchObject({ reason: 'wrong-kind', expected: 'file' })
  })

  it('import エッジ（file 粒度）が method を指すと wrong-kind', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const edge = g.edges.find((e) => e.kind === 'import')!
        edge.to = anyMethod(g)
      }),
    )

    const hit = report.violations.find((x) => x.kind === 'edges[].to')
    expect(hit).toMatchObject({ reason: 'wrong-kind', expected: 'file' })
  })

  it('method 粒度のエッジが file を指すと wrong-kind', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const edge = g.edges.find((e) => e.granularity === 'method')!
        edge.from = anyFile(g)
      }),
    )

    const hit = report.violations.find((x) => x.kind === 'edges[].from')
    expect(hit).toMatchObject({ reason: 'wrong-kind', expected: 'method' })
  })

  it('unresolved[].from が file を指すと wrong-kind', () => {
    const report = checkIntegrity(graphOf((g) => void (g.unresolved[0]!.from = anyFile(g))))

    expect(report.violations[0]).toMatchObject({
      kind: 'unresolved[].from',
      reason: 'wrong-kind',
      expected: 'method',
    })
  })

  it('implementations が file を指すと wrong-kind', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const edge = g.edges.find((e) => e.kind === 'call' && e.implementations?.length)!
        if (edge.kind === 'call') edge.implementations = [anyFile(g)]
      }),
    )

    expect(report.violations[0]).toMatchObject({
      kind: 'edges[].implementations[]',
      reason: 'wrong-kind',
      expected: 'method',
    })
  })

  it('construct エッジの implementations も同じ経路で検査される', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const edge = g.edges.find((e) => e.kind === 'construct')!
        if (edge.kind === 'construct') edge.implementations = [anyFile(g)]
      }),
    )

    expect(report.violations[0]).toMatchObject({
      kind: 'edges[].implementations[]',
      reason: 'wrong-kind',
      expected: 'method',
    })
  })

  it('unresolved[].candidates は種別を見ない（動的 import の候補は file になりうる）', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const dynamicImport = g.unresolved.find((u) => u.reason === 'dynamic-import')!
        dynamicImport.candidates = [anyFile(g)]
      }),
    )

    expect(report.total).toBe(0)
  })

  it('cycles[].nodes は種別を見ない（スキーマに規定が無い）', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.cycles[3]!.nodes = [anyFile(g), anyMethod(g)]
      }),
    )

    expect(report.total).toBe(0)
  })

  it('正しい種別なら違反にしない', () => {
    expect(checkIntegrity(graphOf()).total).toBe(0)
  })
})

describe('層の参照', () => {
  it('実在しない層 ID を検出する', () => {
    const report = checkIntegrity(graphOf((g) => void (g.nodes[0]!.layer = 'ghost')))

    expect(report.totals['nodes[].layer']).toBe(1)
    expect(report.violations[0]).toEqual({
      kind: 'nodes[].layer',
      reason: 'missing',
      at: 'nodes[0].layer',
      id: 'ghost',
    })
  })

  it('層が未設定のノードは違反にしない（層なしは欠陥ではない / ADR-002）', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        delete g.nodes[0]!.layer
      }),
    )

    expect(report.total).toBe(0)
  })

  it('層 ID の重複を検出する', () => {
    const report = checkIntegrity(graphOf((g) => void (g.layers[1]!.id = g.layers[0]!.id)))

    expect(report.totals['layers[].id']).toBe(1)
    expect(report.violations.find((x) => x.kind === 'layers[].id')?.at).toBe('layers[1].id')
  })

  it('層 ID を重複させると、その層を指していたノードの参照も連鎖して壊れる', () => {
    const report = checkIntegrity(graphOf((g) => void (g.layers[1]!.id = g.layers[0]!.id)))

    // 上書きで消えた層 ID を指すノードが、実在しない層を指す状態になる
    expect(report.totals['nodes[].layer']).toBeGreaterThan(0)
  })
})

describe('ID の一意性', () => {
  it('エッジの ID 重複を検出する', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.edges[1] = { ...g.edges[0]! }
      }),
    )

    expect(report.totals['edges[].id']).toBe(1)
    expect(report.violations[0]).toEqual({
      kind: 'edges[].id',
      reason: 'duplicate',
      at: 'edges[1].id',
      id: 'e_0001',
    })
  })

  it('ノードの ID 重複は、参照が偶然通っていても検出する', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.nodes[1]!.id = g.nodes[0]!.id
      }),
    )

    expect(report.totals['nodes[].id']).toBe(1)
  })

  it('3 つ重複すれば 2 件（2 回目以降）を数え、位置で区別できる', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.cycles[1]!.id = g.cycles[0]!.id
        g.cycles[2]!.id = g.cycles[0]!.id
      }),
    )

    expect(report.totals['cycles[].id']).toBe(2)
    expect(report.violations.map((x) => x.at)).toEqual(['cycles[1].id', 'cycles[2].id'])
  })

  it('入れ子の位置も添字で示す', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const method = g.nodes.find((n) => n.kind === 'method')!
        g.unresolved[0]!.candidates = [method.id, 'method:src/無い.ts#A.b']
      }),
    )

    expect(report.violations[0]?.at).toBe('unresolved[0].candidates[1]')
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
      kind: 'edges[].from',
      reason: 'missing',
      at: 'edges[0].from',
      id: 'file:src/存在しない.ts',
    })
  })

  it('nodes[].parent が外れると検出する', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        const method = g.nodes.find((n) => n.kind === 'method')!
        if (method.kind === 'method') method.parent = 'file:src/無い.ts'
      }),
    )

    expect(report.totals['nodes[].parent']).toBe(1)
  })

  it('cycles[].edges はエッジ ID の実在を見る', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.cycles[0]!.edges = ['e_9999']
      }),
    )

    expect(report.totals['cycles[].edges[]']).toBe(1)
    expect(report.violations[0]?.id).toBe('e_9999')
  })

  it('unresolved[].candidates も検査対象', () => {
    const report = checkIntegrity(
      graphOf((g) => {
        g.unresolved[0]!.candidates = ['method:src/無い.ts#A.b']
      }),
    )

    expect(report.totals['unresolved[].candidates[]']).toBe(1)
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
    expect(report.totals['edges[].from']).toBe(broken)
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
    expect(kinds).toContain('edges[].from')
    expect(kinds).toContain('cycles[].edges[]')
    expect(report.totals['edges[].from']).toBe(50)
    expect(report.totals['cycles[].edges[]']).toBe(1)
  })
})
