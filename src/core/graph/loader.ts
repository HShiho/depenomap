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

/**
 * 失敗した場合も、そこまでに集まった警告を返す。正本を直す側にとっては
 * 「整合性が壊れている」と「版が違う」「未知フィールドがある」が同時に
 * 見えたほうが速い。
 */
export type LoadResult =
  | { ok: true; graph: DependencyGraph; warnings: LoadWarning[] }
  | { ok: false; errors: LoadError[]; warnings: LoadWarning[] }

interface Semver {
  major: number
  minor: number
  patch: number
}

/**
 * Valibot の issue パスを `nodes[3].path` の形に整える。
 *
 * 配列の添字はブラケットで表し、実際の位置を残す。未知フィールドの報告は
 * フィールドごとに畳むため `nodes[].exported` と正規化するが、こちらは
 * 「どの要素が壊れているか」を指すので実添字が要る（UT-01 決定事項）。
 */
function formatIssuePath(path: { key: unknown }[] | undefined): string {
  if (!path) return ''
  return path.reduce<string>((acc, segment) => {
    if (typeof segment.key === 'number') return `${acc}[${segment.key}]`
    return acc ? `${acc}.${String(segment.key)}` : String(segment.key)
  }, '')
}

function parseSemver(value: string): Semver | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) return undefined
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/** 版の判定結果。エラーか警告かを枝で分け、型で取り違えられないようにする */
type VersionVerdict =
  | { outcome: 'ok' }
  | { outcome: 'warn'; warning: LoadWarning }
  | { outcome: 'reject'; error: LoadError }

/**
 * `schemaVersion` を semver で分岐する。
 * major 不一致は構造が変わった前提で拒否し、minor / patch の相違は
 * 後方互換の追加とみなして警告のうえ続行する（UT-01 決定事項）。
 *
 * 値が文字列でない場合は版の問題として扱わない。それは構造不正であり、
 * 「バージョンを上げれば読める」と誤読させないためにスキーマ検査へ委ねる。
 */
function checkSchemaVersion(actual: unknown): VersionVerdict {
  if (typeof actual !== 'string') return { outcome: 'ok' }
  if (actual === SUPPORTED_SCHEMA_VERSION) return { outcome: 'ok' }

  const expected = parseSemver(SUPPORTED_SCHEMA_VERSION)!
  const found = parseSemver(actual)

  if (!found || found.major !== expected.major) {
    return {
      outcome: 'reject',
      error: { type: 'schema-version-incompatible', expected: SUPPORTED_SCHEMA_VERSION, actual },
    }
  }
  return {
    outcome: 'warn',
    warning: { type: 'schema-version-differs', expected: SUPPORTED_SCHEMA_VERSION, actual },
  }
}

/** すでにパース済みの値を検査する。ファイル読み込みを伴わない経路 */
export function loadGraphFromValue(raw: unknown): LoadResult {
  const warnings: LoadWarning[] = []

  // schemaVersion は構造検査より先に見る。major が違えば以降の検査に意味がない
  if (typeof raw === 'object' && raw !== null && 'schemaVersion' in raw) {
    const verdict = checkSchemaVersion((raw as { schemaVersion: unknown }).schemaVersion)
    if (verdict.outcome === 'reject') return { ok: false, errors: [verdict.error], warnings }
    if (verdict.outcome === 'warn') warnings.push(verdict.warning)
  }

  const parsed = v.safeParse(DependencyGraphSchema, raw)
  if (!parsed.success) {
    return {
      ok: false,
      warnings,
      errors: [
        {
          type: 'schema-mismatch',
          issues: parsed.issues.map((issue) => ({
            path: formatIssuePath(issue.path),
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
    return { ok: false, errors: [{ type: 'integrity-violated', report: integrity }], warnings }
  }

  return { ok: true, graph: parsed.output, warnings }
}
