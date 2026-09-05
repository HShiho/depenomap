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
    expect(error.report.violations[0]?.kind).toBe('edges.from')
  })
})
