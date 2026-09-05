import { DependencyGraphSchema } from './schema'

/**
 * 未知フィールドの検出。
 *
 * スキーマに無いフィールドは読み飛ばす（下流へ渡さない）が、存在したことは
 * 報告する（UT-01 決定事項）。抽出器は本スコープ外で別に進化するため、
 * フィールドが増えるたびに読み込みが壊れるのは害であり、一方で黙って
 * 捨てると気づけないため。
 *
 * 検出はスキーマの `entries` を再帰的に辿って行う。`looseObject()` 版の
 * スキーマを別に持つ案は、定義が二重化して更新漏れを生むため採らない
 * （ADR-005「型と実行時検査を 1 つの定義から起こす」）。
 */

/** 報告する種類の上限。畳んだ後の種類数はスキーマ表面積で頭打ちになるため、実質発動しない */
export const MAX_UNKNOWN_FIELD_KINDS = 10

export interface UnknownField {
  /** 配列添字を潰した正規化パス（例: `nodes[].exported`） */
  path: string
  /** 出現件数 */
  count: number
  /** 実際に現れた位置の一例（例: `nodes[3].exported`） */
  example: string
}

export interface UnknownFieldReport {
  fields: UnknownField[]
  /** 正規化後の種類数。fields が上限で切られていても実数 */
  totalKinds: number
  truncated: boolean
}

type AnySchema = { type: string; [key: string]: unknown }

/** `optional` / `nullable` などのラッパーを剥がし、内側のスキーマを返す */
function unwrap(schema: AnySchema): AnySchema {
  let current = schema
  while (
    current.type === 'optional' ||
    current.type === 'nullable' ||
    current.type === 'nullish' ||
    current.type === 'undefinedable'
  ) {
    current = current.wrapped as AnySchema
  }
  return current
}

/**
 * `variant` から、値の判別子に対応する枝を選ぶ。
 * 判別子が一致する枝が無ければ undefined（スキーマ検査側が別途エラーにする）。
 */
function selectVariantOption(
  schema: AnySchema,
  value: Record<string, unknown>,
): AnySchema | undefined {
  const key = schema.key as string
  const actual = value[key]
  for (const option of schema.options as AnySchema[]) {
    const entries = option.entries as Record<string, AnySchema> | undefined
    const discriminator = entries?.[key]
    if (!discriminator) continue
    if (unwrap(discriminator).literal === actual) return option
  }
  return undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 値をスキーマと突き合わせ、スキーマ側に無いキーを集める。
 * 添字は正規化パスでは `[]` に潰し、例示パスでは実際の添字を残す。
 */
function walk(
  schema: AnySchema,
  value: unknown,
  normalized: string,
  actual: string,
  found: Map<string, { count: number; example: string }>,
): void {
  const current = unwrap(schema)

  if (current.type === 'array') {
    if (!Array.isArray(value)) return
    const item = current.item as AnySchema
    value.forEach((element, index) => {
      walk(item, element, `${normalized}[]`, `${actual}[${index}]`, found)
    })
    return
  }

  if (current.type === 'variant') {
    if (!isPlainObject(value)) return
    const option = selectVariantOption(current, value)
    if (option) walk(option, value, normalized, actual, found)
    return
  }

  if (current.type !== 'object' || !isPlainObject(value)) return

  const entries = current.entries as Record<string, AnySchema>
  for (const [key, child] of Object.entries(value)) {
    const childNormalized = normalized ? `${normalized}.${key}` : key
    const childActual = actual ? `${actual}.${key}` : key
    const entry = entries[key]

    if (!entry) {
      const hit = found.get(childNormalized)
      if (hit) hit.count += 1
      else found.set(childNormalized, { count: 1, example: childActual })
      continue
    }

    walk(entry, child, childNormalized, childActual, found)
  }
}

/** 生の JSON を受け取り、スキーマに無いフィールドを畳んで報告する */
export function findUnknownFields(raw: unknown): UnknownFieldReport {
  const found = new Map<string, { count: number; example: string }>()
  walk(DependencyGraphSchema as unknown as AnySchema, raw, '', '', found)

  const all = [...found.entries()].map(([path, { count, example }]) => ({ path, count, example }))
  all.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))

  return {
    fields: all.slice(0, MAX_UNKNOWN_FIELD_KINDS),
    totalKinds: all.length,
    truncated: all.length > MAX_UNKNOWN_FIELD_KINDS,
  }
}
