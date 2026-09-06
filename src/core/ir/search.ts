import type { GraphNode } from '../graph/schema'

/**
 * 検索キーの事前算出（ADR-003）。
 *
 * 検索の対象はファイル名・メソッド名・パスの 3 つ。一致方式は部分一致で、
 * 大文字小文字を区別しない。
 *
 * ノードごとに検索対象文字列を小文字化して**事前に持つ**。入力のたびに
 * 組み立て直さない。
 *
 * パスを含めるのは `src/domain/` のようなディレクトリ単位の絞り込みを
 * 同じ入力欄で行うため。メソッドは所属ファイルのパスを含める。
 */

/**
 * 対象を連結するときの区切り。
 *
 * 半角スペースで繋ぐと区切り自体が照合対象になり、名前とパスの境界を
 * またいだ入力（`Todo.ts src`）が別のノードに当たる。検索欄に打てない
 * 文字で区切って、対象ごとの中でしか一致しないようにする
 */
const SEPARATOR = '\n'

/** 検索キーの素材。何を対象にしたかを追えるよう分けて持つ */
export interface SearchKey {
  /** 照合に使う文字列。小文字化済み。対象は `SEPARATOR` で区切る */
  normalized: string
  /** ファイル名またはメソッド名 */
  name: string
  /** ファイルのパス。メソッドは所属ファイルのパス */
  path: string
}

/** 照合用に正規化する。検索語とキーの両方に同じ処理をかける */
export function normalize(value: string): string {
  return value.toLowerCase()
}

/**
 * ノードの検索キーを組む。
 *
 * メソッドは自身のパスを持たないため、所属ファイルのパスを渡す。
 * `owner`（クラス名）は対象に含めない。クラス名はパスに現れることが多く、
 * ADR-003 が定めた 3 つの対象を超えるため。
 */
export function buildSearchKey(node: GraphNode, pathOfFile: string): SearchKey {
  return {
    normalized: normalize(`${node.name}${SEPARATOR}${pathOfFile}`),
    name: node.name,
    path: pathOfFile,
  }
}

/** 検索キーが検索語に一致するか。部分一致・大文字小文字を区別しない */
export function matches(key: SearchKey, query: string): boolean {
  const needle = normalize(query).trim()
  if (needle === '') return false
  return key.normalized.includes(needle)
}

/**
 * 検索キーの索引を組む。
 *
 * ファイルノードは自身の `path`、メソッドノードは所属ファイルの `path` を使う。
 * 所属ファイルが引けないことは UT-01 が参照整合性で防いでいるが、引けなければ
 * パスを空として扱い、名前だけで引けるようにする。
 */
export function buildSearchKeys(
  nodes: readonly GraphNode[],
  pathOf: (nodeId: string) => string | undefined,
): ReadonlyMap<string, SearchKey> {
  return new Map(
    nodes.map((node) => {
      const path = node.kind === 'file' ? node.path : (pathOf(node.parent) ?? '')
      return [node.id, buildSearchKey(node, path)]
    }),
  )
}
