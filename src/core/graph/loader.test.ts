import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadGraphFromValue, SUPPORTED_SCHEMA_VERSION } from './loader'
import { loadGraphFromFile } from './loader.node'

const fixturePath = fileURLToPath(
  new URL('../../../test-data/dependency-graph.complex.json', import.meta.url),
)

async function readFixture(): Promise<Record<string, unknown>> {
  const { readFile } = await import('node:fs/promises')
  return JSON.parse(await readFile(fixturePath, 'utf8')) as Record<string, unknown>
}

async function rawOf(
  mutate?: (g: Record<string, unknown>) => void,
): Promise<Record<string, unknown>> {
  const raw = await readFixture()
  mutate?.(raw)
  return raw
}

/** 一時ファイルに JSON（または任意の文字列）を書き出してパスを返す */
async function writeTemp(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'depenomap-'))
  const path = join(dir, 'graph.json')
  await writeFile(path, content, 'utf8')
  return path
}

describe('loadGraphFromFile', () => {
  it('正本 JSON を読み込めて、警告が無い', async () => {
    const result = await loadGraphFromFile(fixturePath)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.graph.nodes).toHaveLength(88)
    expect(result.warnings).toHaveLength(0)
  })

  it('ファイルが無ければ read-failed を返す', async () => {
    const result = await loadGraphFromFile('/存在しない/graph.json')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.type).toBe('read-failed')
  })

  it('JSON として壊れていれば invalid-json を返す', async () => {
    const result = await loadGraphFromFile(await writeTemp('{ not json'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.type).toBe('invalid-json')
  })
})

describe('スキーマ検査', () => {
  it('セクションが欠けていれば、どこが問題かを返す', async () => {
    const raw = await rawOf((g) => delete g.edges)
    const result = loadGraphFromValue(raw)

    expect(result.ok).toBe(false)
    if (result.ok) return
    const error = result.errors[0]
    expect(error?.type).toBe('schema-mismatch')
    if (error?.type !== 'schema-mismatch') return
    expect(error.issues.some((i) => i.path.startsWith('edges'))).toBe(true)
  })

  it('配列要素の問題は実添字をブラケットで示す', async () => {
    const raw = await rawOf((g) => {
      const nodes = g.nodes as Record<string, unknown>[]
      delete nodes[3]!.path
    })
    const result = loadGraphFromValue(raw)

    expect(result.ok).toBe(false)
    if (result.ok) return
    const error = result.errors[0]
    if (error?.type !== 'schema-mismatch') return expect.fail('schema-mismatch を期待')
    expect(error.issues[0]?.path).toBe('nodes[3].path')
  })
})

describe('schemaVersion の分岐', () => {
  it('一致すれば警告なし', async () => {
    const result = loadGraphFromValue(await rawOf())

    expect(result.ok && result.warnings).toHaveLength(0)
  })

  it('minor 相違は警告して続行する', async () => {
    const result = loadGraphFromValue(await rawOf((g) => (g.schemaVersion = '1.1.0')))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([
      { type: 'schema-version-differs', expected: SUPPORTED_SCHEMA_VERSION, actual: '1.1.0' },
    ])
  })

  it('patch 相違も警告して続行する', async () => {
    const result = loadGraphFromValue(await rawOf((g) => (g.schemaVersion = '1.0.9')))

    expect(result.ok).toBe(true)
  })

  it('major 不一致は拒否する', async () => {
    const result = loadGraphFromValue(await rawOf((g) => (g.schemaVersion = '2.0.0')))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toEqual({
      type: 'schema-version-incompatible',
      expected: SUPPORTED_SCHEMA_VERSION,
      actual: '2.0.0',
    })
  })

  it('semver として読めない値も拒否する', async () => {
    const result = loadGraphFromValue(await rawOf((g) => (g.schemaVersion = 'draft')))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.type).toBe('schema-version-incompatible')
  })

  it.each([
    ['数値', 1],
    ['オブジェクト', { major: 1 }],
    ['null', null],
  ])('非文字列（%s）は版の問題として扱わず、構造不正として返す', async (_label, value) => {
    const result = loadGraphFromValue(await rawOf((g) => (g.schemaVersion = value)))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.type).toBe('schema-mismatch')
  })

  it('major 不一致では構造検査へ進まず、理由を 1 件だけ返す', async () => {
    const raw = await rawOf((g) => {
      g.schemaVersion = '2.0.0'
      delete g.edges // 構造も壊しておく
    })
    const result = loadGraphFromValue(raw)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.type).toBe('schema-version-incompatible')
  })
})

describe('警告の併存', () => {
  it('版の相違と未知フィールドが同時に出る', async () => {
    const raw = await rawOf((g) => {
      g.schemaVersion = '1.1.0'
      const nodes = g.nodes as Record<string, unknown>[]
      nodes[0]!.exported = true
    })
    const result = loadGraphFromValue(raw)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings.map((w) => w.type).sort()).toEqual([
      'schema-version-differs',
      'unknown-fields',
    ])
  })
})

describe('未知フィールドの警告', () => {
  it('読み飛ばしたうえで、畳んだ形で報告する', async () => {
    const raw = await rawOf((g) => {
      const nodes = g.nodes as Record<string, unknown>[]
      for (const node of nodes) node.exported = true
    })
    const result = loadGraphFromValue(raw)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warning = result.warnings[0]
    expect(warning?.type).toBe('unknown-fields')
    if (warning?.type !== 'unknown-fields') return
    expect(warning.fields[0]).toMatchObject({ path: 'nodes[].exported', count: 88 })

    // 下流へは渡さない
    expect(result.graph.nodes[0]).not.toHaveProperty('exported')
  })
})

describe('失敗時の警告', () => {
  it('整合性違反で拒否しても、版の相違と未知フィールドは返る', async () => {
    const raw = await rawOf((g) => {
      g.schemaVersion = '1.1.0'
      const nodes = g.nodes as Record<string, unknown>[]
      nodes[0]!.exported = true
      const edges = g.edges as Record<string, unknown>[]
      edges[0]!.from = 'file:src/無い.ts'
    })
    const result = loadGraphFromValue(raw)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.type).toBe('integrity-violated')
    expect(result.warnings.map((w) => w.type).sort()).toEqual([
      'schema-version-differs',
      'unknown-fields',
    ])
  })

  it('構造不正でも、未知フィールドと版の相違が同時に見える', async () => {
    const raw = await rawOf((g) => {
      g.schemaVersion = '1.1.0'
      const nodes = g.nodes as Record<string, unknown>[]
      nodes[0]!.exported = true
      delete g.edges
    })
    const result = loadGraphFromValue(raw)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.type).toBe('schema-mismatch')
    expect(result.warnings.map((w) => w.type).sort()).toEqual([
      'schema-version-differs',
      'unknown-fields',
    ])
  })

  it('版が非互換なら、そこまでの警告だけを返す', async () => {
    const result = loadGraphFromValue(await rawOf((g) => (g.schemaVersion = '2.0.0')))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.warnings).toEqual([])
  })
})

describe('参照整合性', () => {
  it('違反があれば、該当要素を落とさず全体を拒否する', async () => {
    const raw = await rawOf((g) => {
      const edges = g.edges as Record<string, unknown>[]
      edges[0]!.from = 'file:src/無い.ts'
    })
    const result = loadGraphFromValue(raw)

    expect(result.ok).toBe(false)
    if (result.ok) return
    const error = result.errors[0]
    expect(error?.type).toBe('integrity-violated')
    if (error?.type !== 'integrity-violated') return
    expect(error.report.total).toBe(1)
    expect(error.report.violations[0]?.kind).toBe('edges[].from')
  })
})
