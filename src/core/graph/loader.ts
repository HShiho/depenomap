import * as v from 'valibot'

import { checkIntegrity, type IntegrityReport } from './integrity'
import { DependencyGraphSchema, type DependencyGraph } from './schema'
import { findUnknownFields, type UnknownField } from './unknown-fields'

/**
 * 正本 JSON の読み込み口。UT-01 が後続に公開する契約そのもの。
 *
 * 返すのは「成功（グラフ＋警告）」か「失敗（理由の一覧）」のいずれか。
 * 警告は「読めたが伝えておくべきこと」、失敗は「読めなかった」を表す。
 *
 * 検査は「JSON として妥当か」だけを見る。依存関係の内容の良し悪しは
 * 一切判定しない（N-1）。
 */

/** このビューアが前提とするスキーマのバージョン */
export const SUPPORTED_SCHEMA_VERSION = '1.0.0'

export type LoadWarning =
  | { type: 'unknown-fields'; fields: UnknownField[]; totalKinds: number; truncated: boolean }
  | { type: 'schema-version-differs'; expected: string; actual: string }

export type LoadError =
  | { type: 'read-failed'; path: string; message: string }
  | { type: 'invalid-json'; path: string; message: string }
  | { type: 'schema-mismatch'; issues: { path: string; message: string }[] }
  | { type: 'schema-version-incompatible'; expected: string; actual: string }
  | { type: 'integrity-violated'; report: IntegrityReport }

export type LoadResult =
  { ok: true; graph: DependencyGraph; warnings: LoadWarning[] } | { ok: false; errors: LoadError[] }

interface Semver {
  major: number
  minor: number
  patch: number
}

function parseSemver(value: string): Semver | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) return undefined
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/**
 * `schemaVersion` を semver で分岐する。
 * major 不一致は構造が変わった前提で拒否し、minor / patch の相違は
 * 後方互換の追加とみなして警告のうえ続行する（UT-01 決定事項）。
 */
function checkSchemaVersion(actual: string): LoadWarning | LoadError | undefined {
  if (actual === SUPPORTED_SCHEMA_VERSION) return undefined

  const expected = parseSemver(SUPPORTED_SCHEMA_VERSION)!
  const found = parseSemver(actual)

  if (!found || found.major !== expected.major) {
    return { type: 'schema-version-incompatible', expected: SUPPORTED_SCHEMA_VERSION, actual }
  }
  return { type: 'schema-version-differs', expected: SUPPORTED_SCHEMA_VERSION, actual }
}

function isError(value: LoadWarning | LoadError): value is LoadError {
  return value.type === 'schema-version-incompatible'
}

/** すでにパース済みの値を検査する。ファイル読み込みを伴わない経路 */
export function loadGraphFromValue(raw: unknown): LoadResult {
  const warnings: LoadWarning[] = []

  // schemaVersion は構造検査より先に見る。major が違えば以降の検査に意味がない
  if (typeof raw === 'object' && raw !== null && 'schemaVersion' in raw) {
    const verdict = checkSchemaVersion(String((raw as { schemaVersion: unknown }).schemaVersion))
    if (verdict && isError(verdict)) return { ok: false, errors: [verdict] }
    if (verdict) warnings.push(verdict)
  }

  const parsed = v.safeParse(DependencyGraphSchema, raw)
  if (!parsed.success) {
    return {
      ok: false,
      errors: [
        {
          type: 'schema-mismatch',
          issues: parsed.issues.map((issue) => ({
            path: issue.path?.map((p) => String(p.key)).join('.') ?? '',
            message: issue.message,
          })),
        },
      ],
    }
  }

  const unknown = findUnknownFields(raw)
  if (unknown.fields.length > 0) {
    warnings.push({
      type: 'unknown-fields',
      fields: unknown.fields,
      totalKinds: unknown.totalKinds,
      truncated: unknown.truncated,
    })
  }

  const integrity = checkIntegrity(parsed.output)
  if (integrity.total > 0) {
    return { ok: false, errors: [{ type: 'integrity-violated', report: integrity }] }
  }

  return { ok: true, graph: parsed.output, warnings }
}
