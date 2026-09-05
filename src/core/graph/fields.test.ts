import { describe, expect, it } from 'vitest'

import { IDENTITY_FIELDS, PLAIN_FIELDS, REFERENCE_FIELDS } from './fields'
import { DependencyGraphSchema } from './schema'
import { collectSchemaTypes, walkSchema, WALKABLE_TYPES, type AnySchema } from './schema-walk'

/**
 * 分類漏れを検出するための完全性テスト。
 *
 * スキーマ上の文字列フィールドを機械的に列挙し、3 つの分類の和集合と
 * 厳密に一致することを確かめる。スキーマにフィールドを足すとここが落ち、
 * REFERENCE / IDENTITY / PLAIN のどれかへ分類することを強制される。
 *
 * 走査規則は `schema-walk.ts` に集約してある。未知の schema type に
 * 出会うと走査が例外で止まるため、扱えない型を持ち込むと素通りしない。
 */

const schemaFields = (() => {
  const found: string[] = []
  walkSchema(DependencyGraphSchema as unknown as AnySchema, {
    onStringLeaf: (path) => found.push(path),
  })
  return [...new Set(found)].sort()
})()

const classified = [...Object.keys(REFERENCE_FIELDS), ...IDENTITY_FIELDS, ...PLAIN_FIELDS].sort()

describe('走査の前提', () => {
  it('スキーマは走査できる schema type だけで構成されている', () => {
    const used = collectSchemaTypes(DependencyGraphSchema as unknown as AnySchema)
    const unwalkable = [...used].filter((t) => !(WALKABLE_TYPES as readonly string[]).includes(t))

    expect(unwalkable).toEqual([])
  })

  it('未知の schema type に出会うと走査が止まる', () => {
    const withUnion: AnySchema = {
      type: 'object',
      entries: { weird: { type: 'union', options: [] } },
    }

    expect(() => walkSchema(withUnion, {})).toThrow(/走査できない schema type: 'union'/)
  })
})

describe('フィールド分類の完全性', () => {
  it('スキーマの文字列フィールドをすべて列挙できている', () => {
    expect(schemaFields.length).toBeGreaterThan(0)
  })

  it('分類漏れが無い（スキーマにあって分類に無いフィールド）', () => {
    const missing = schemaFields.filter((f) => !classified.includes(f))

    expect(missing).toEqual([])
  })

  it('余分な分類が無い（分類にあってスキーマに無いフィールド）', () => {
    const extra = classified.filter((f) => !schemaFields.includes(f))

    expect(extra).toEqual([])
  })

  it('同じフィールドが 2 つの分類に属さない', () => {
    const duplicated = classified.filter((f, i) => classified.indexOf(f) !== i)

    expect(duplicated).toEqual([])
  })
})
