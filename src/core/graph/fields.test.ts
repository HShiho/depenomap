import { describe, expect, it } from 'vitest'

import { IDENTITY_FIELDS, PLAIN_FIELDS, REFERENCE_FIELDS } from './fields'
import { DependencyGraphSchema } from './schema'

/**
 * 分類漏れを検出するための完全性テスト。
 *
 * スキーマ上の文字列フィールドを機械的に列挙し、3 つの分類の和集合と
 * 厳密に一致することを確かめる。スキーマにフィールドを足すとここが落ち、
 * REFERENCE / IDENTITY / PLAIN のどれかへ分類することを強制される。
 */

type AnySchema = { type: string; [key: string]: unknown }

const WRAPPERS = ['optional', 'nullable', 'nullish', 'undefinedable']

function unwrap(schema: AnySchema): AnySchema {
  let current = schema
  while (WRAPPERS.includes(current.type)) current = current.wrapped as AnySchema
  return current
}

/** 文字列として現れるリーフの正規化パスを集める */
function collectStringLeaves(schema: AnySchema, path: string, found: Set<string>): void {
  const current = unwrap(schema)

  switch (current.type) {
    case 'array':
      return collectStringLeaves(current.item as AnySchema, `${path}[]`, found)
    case 'variant':
      for (const option of current.options as AnySchema[]) collectStringLeaves(option, path, found)
      return
    case 'object':
      for (const [key, child] of Object.entries(current.entries as Record<string, AnySchema>)) {
        collectStringLeaves(child, path ? `${path}.${key}` : key, found)
      }
      return
    case 'pipe':
      return collectStringLeaves((current.pipe as AnySchema[])[0]!, path, found)
    case 'string':
    case 'literal':
    case 'picklist':
      found.add(path)
      return
    default:
      // 数値・真偽値は ID になり得ないため分類の対象外
      return
  }
}

const schemaFields = (() => {
  const found = new Set<string>()
  collectStringLeaves(DependencyGraphSchema as unknown as AnySchema, '', found)
  return [...found].sort()
})()

const classified = [...Object.keys(REFERENCE_FIELDS), ...IDENTITY_FIELDS, ...PLAIN_FIELDS].sort()

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
