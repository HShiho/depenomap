/**
 * Valibot スキーマの走査。
 *
 * 未知フィールドの検出（`unknown-fields.ts`）と、参照フィールドの分類漏れを
 * 検出する完全性テスト（`fields.test.ts`）が、同じ走査規則を共有するための
 * モジュール。以前は 2 箇所に別実装があり、片方だけ直る形が残っていた。
 *
 * **未知の schema type に出会ったら止まる（fail-closed）。** 黙って走査を
 * 終えると、その先のフィールドが検査から漏れる。union / record / lazy などを
 * スキーマに持ち込むと、まずここで気づく。
 */

export type AnySchema = { type: string; [key: string]: unknown }

/** 値を包むだけで構造を変えないラッパー */
const WRAPPERS = ['optional', 'nullable', 'nullish', 'undefinedable'] as const

/**
 * 走査が扱える schema type。
 *
 * ここに無い type がスキーマに現れたら、走査規則を足すか、
 * そもそも使わないかを決める必要がある。
 */
export const WALKABLE_TYPES = [
  ...WRAPPERS,
  'object',
  'array',
  'variant',
  // 以下はリーフ。これ以上たどらない
  'string',
  'literal',
  'picklist',
  'number',
  'boolean',
] as const

/** 文字列として現れるリーフ */
export const STRING_LEAF_TYPES = ['string', 'literal', 'picklist'] as const

/** ID になり得ないリーフ */
export const NON_STRING_LEAF_TYPES = ['number', 'boolean'] as const

export class UnwalkableSchemaError extends Error {
  constructor(
    readonly schemaType: string,
    readonly path: string,
  ) {
    super(
      `走査できない schema type: '${schemaType}'（${path || '(ルート)'}）。` +
        `schema-walk.ts に走査規則を足すか、この型を使わないでください。`,
    )
    this.name = 'UnwalkableSchemaError'
  }
}

/**
 * ラッパーを剥がし、内側のスキーマを返す。
 *
 * Valibot の `pipe()` は基底スキーマを spread して返すため、`type` は
 * `array` / `object` のまま保たれる。`type: 'pipe'` は現れないので、
 * ここで剥がす必要はない。
 */
export function unwrap(schema: AnySchema): AnySchema {
  let current = schema
  while ((WRAPPERS as readonly string[]).includes(current.type)) {
    current = current.wrapped as AnySchema
  }
  return current
}

/** 走査中に呼ばれるコールバック。リーフに達したときだけ呼ばれる */
export interface WalkVisitor {
  /** 文字列として現れるリーフ */
  onStringLeaf?: (path: string) => void
  /** ID になり得ないリーフ */
  onOtherLeaf?: (path: string) => void
}

/**
 * スキーマを走査し、リーフの正規化パス（配列添字を `[]` に潰したもの）を渡す。
 * 扱えない type に出会うと `UnwalkableSchemaError` を投げる。
 */
export function walkSchema(schema: AnySchema, visitor: WalkVisitor, path = ''): void {
  const current = unwrap(schema)

  switch (current.type) {
    case 'array':
      return walkSchema(current.item as AnySchema, visitor, `${path}[]`)
    case 'variant':
      for (const option of current.options as AnySchema[]) walkSchema(option, visitor, path)
      return
    case 'object':
      for (const [key, child] of Object.entries(current.entries as Record<string, AnySchema>)) {
        walkSchema(child, visitor, path ? `${path}.${key}` : key)
      }
      return
    default:
      if ((STRING_LEAF_TYPES as readonly string[]).includes(current.type)) {
        visitor.onStringLeaf?.(path)
        return
      }
      if ((NON_STRING_LEAF_TYPES as readonly string[]).includes(current.type)) {
        visitor.onOtherLeaf?.(path)
        return
      }
      throw new UnwalkableSchemaError(current.type, path)
  }
}

/** 値がスキーマらしきオブジェクトか。`picklist` の options は文字列の配列なので弾く */
function isSchemaNode(value: unknown): value is AnySchema {
  return (
    typeof value === 'object' && value !== null && typeof (value as AnySchema).type === 'string'
  )
}

/** スキーマに現れる schema type をすべて集める（fail-closed の検査用） */
export function collectSchemaTypes(schema: AnySchema, found = new Set<string>()): Set<string> {
  if (!isSchemaNode(schema)) return found
  found.add(schema.type)

  const children: unknown[] = [schema.wrapped, schema.item]
  if (Array.isArray(schema.options)) children.push(...schema.options)
  if (schema.entries && typeof schema.entries === 'object') {
    children.push(...Object.values(schema.entries))
  }

  for (const child of children) {
    if (isSchemaNode(child)) collectSchemaTypes(child, found)
  }
  return found
}
