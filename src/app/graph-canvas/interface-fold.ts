/**
 * インターフェースのノードを畳む（UT-29 / UT-07 の帰結）。
 *
 * UT-07 は**インターフェース経由の呼び出しを実装へ解決して描く**と決めた。
 * 呼び出し元 → interface → 実装 の 2 本ではなく、呼び出し元 → 実装の 1 本を
 * 描く。その結果、**interface のノードは経由点として図に残っているのに、
 * 呼び出しの線はそこを通っていない**。畳めるようにする。
 *
 * **メソッド粒度だけを対象にする**（UT-29 の決定）。ファイル粒度の `import` は
 * 実際の依存であり、畳むと正本 JSON が言っている事実が図から消える。迂回されて
 * いるのはメソッド粒度の呼び出しだけである。
 *
 * 判定は正本 JSON の値（`ownerKind`）だけで決まる。**ビューアは推測しない**
 * （ADR-002 と同じ立場）。
 *
 * 畳むことは良し悪しではない（N-1）。「interface が多い」とも言わない。
 */

import type { ViewModel } from '@/core/ir/view-model'

/**
 * 畳む対象のメソッド ID。
 *
 * 正本 JSON が `ownerKind: 'interface'` と言っているものだけ。トップレベル関数
 * （`owner` が null）やクラスのメソッドは対象にならない。
 */
export function interfaceMethodIds(viewModel: ViewModel): ReadonlySet<string> {
  return new Set(
    viewModel.nodes.method
      .filter((node) => node.kind === 'method' && node.ownerKind === 'interface')
      .map((node) => node.id),
  )
}

/** 好みを覚える先。`localStorage` を直接掴まない（テストと SSR のため） */
export type FoldStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * 記憶の鍵。**解析対象ごとに持つ**（ADR-006 と同じ扱い）。
 *
 * `meta.rootDir` を使う。同じリポジトリの別スナップショットでは、畳みたいか
 * どうかは変わらないと見なす。別のリポジトリのグラフを開いたときに、前の
 * 判断を持ち込まない。
 */
export function foldStorageKey(rootDir: string): string {
  return `depenomap:fold-interfaces:${rootDir}`
}

/** 覚えている好み。読めなければ「畳まない」 */
export function readFoldPreference(storage: FoldStorage | undefined, rootDir: string): boolean {
  if (storage === undefined) return false

  try {
    return storage.getItem(foldStorageKey(rootDir)) === 'true'
  } catch {
    // 保存が禁止されている環境では、読むだけでも投げる
    return false
  }
}

/**
 * 好みを覚える。
 *
 * **畳まない状態は覚えない**（鍵ごと消す）。既定と同じ値を書き残すと、あとで
 * 既定を変えたときに、古い利用者だけが前の既定のまま残る。
 */
export function writeFoldPreference(
  storage: FoldStorage | undefined,
  rootDir: string,
  folded: boolean,
): void {
  if (storage === undefined) return

  try {
    if (folded) storage.setItem(foldStorageKey(rootDir), 'true')
    else storage.removeItem(foldStorageKey(rootDir))
  } catch {
    // 覚えられないだけで、畳む操作そのものは成立する
  }
}
