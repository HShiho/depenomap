/**
 * インターフェースのノードを畳む（UT-29 / UT-30 の後段）。
 *
 * **実装宛で読んでいるときだけ**（UT-30）畳める。その読み方では呼び出しの線が
 * `呼び出し元 → 実装` へ描かれるので、インターフェースのノードは**呼び出しの線が
 * 1 本も通らない点**として図に残る。列を占め、層をまたぐ流れを読む視線を止める。
 *
 * インターフェース宛で読んでいるときは畳めない。そちらでは線が interface を
 * 通っており、畳むと**呼び出しの事実そのものが図から消える**。
 *
 * 畳んでも呼び出しは残るが、`implements` の線は行き先ごと消える（誰が実装かが
 * 読めなくなる）。そのことは断りで伝える。
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
