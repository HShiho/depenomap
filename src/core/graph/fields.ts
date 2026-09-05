/**
 * 正本 JSON の文字列フィールドの分類。
 *
 * 参照整合性の検査対象は、これまで人が気づいたものを 1 つずつ足してきた。
 * その結果 `edges[].implementations` と `nodes[].layer` が二度にわたって
 * 漏れている。同じ見落としを繰り返さないため、**スキーマ上のすべての文字列
 * フィールドを 3 つに分類し、分類漏れをテストで検出する**（`fields.test.ts`）。
 *
 * スキーマにフィールドを足すと完全性テストが落ち、分類を強制される。
 * 参照または ID として分類すれば違反種別が増え、テーブル駆動テストが
 * その種別の検査を要求する。検査を書かない限りテストが通らない。
 *
 * パスは配列添字を潰した正規化パス（未知フィールドの報告と同じ表記）。
 */

/** 参照先の種類 */
export type ReferenceTarget = 'node' | 'edge' | 'layer'

/** ID を指すフィールド。参照整合性の検査対象 */
export const REFERENCE_FIELDS = {
  'edges[].from': 'node',
  'edges[].to': 'node',
  'edges[].implementations[]': 'node',
  'nodes[].parent': 'node',
  'nodes[].layer': 'layer',
  'cycles[].nodes[]': 'node',
  'cycles[].edges[]': 'edge',
  'unresolved[].from': 'node',
  'unresolved[].candidates[]': 'node',
} as const satisfies Record<string, ReferenceTarget>

/** ID そのもの。一意性の検査対象 */
export const IDENTITY_FIELDS = [
  'nodes[].id',
  'edges[].id',
  'cycles[].id',
  'unresolved[].id',
  'layers[].id',
] as const

/**
 * ID ではない文字列。整合性の検査をしない。
 *
 * 「検査し忘れた」と「検査しないと決めた」を区別するため、明示的に列挙する。
 */
export const PLAIN_FIELDS = [
  'schemaVersion',
  'meta.generatedAt',
  'meta.rootDir',
  'meta.tsconfig',
  'meta.snapshot.label',
  'meta.snapshot.commit',
  'meta.snapshot.branch',
  'layers[].name',
  'layers[].match[]',
  'nodes[].kind',
  'nodes[].name',
  'nodes[].path',
  'nodes[].owner',
  'nodes[].ownerKind',
  'edges[].kind',
  'edges[].granularity',
  'edges[].importKind',
  'edges[].resolution',
  'edges[].specifier',
  'unresolved[].reason',
  'unresolved[].expression',
] as const

export type ReferenceField = keyof typeof REFERENCE_FIELDS
export type IdentityField = (typeof IDENTITY_FIELDS)[number]
