/**
 * 合成ルートの層を隠す（UT-31 / ADR-006）。
 *
 * DI コンテナの組み立て（合成ルート）は構成上ほぼ全部に依存する。組み立てが
 * 1 か所に集まっている構成では、そこから全層へ線が伸びて図が埋まる。合成ルートは
 * 依存の向きを読むための構造ではなく組み立ての手続きなので、隠せるようにする。
 *
 * **隠せるのは合成ルートの層だけ**（ADR-006 決定 1）。層ごとの汎用的な表示切り
 * 替えは持たない。**どの層が合成ルートかは起動パラメータで受け取る**（決定 2）。
 * ビューアは層 ID を決め打ちしない（ADR-002）。
 *
 * 隠すことは良し悪しではない（N-1）。「合成ルートが重い」とも言わない。
 * 性能の手当てとしても使わない（決定 5）。
 */

import type { Granularity, ViewModel } from '@/core/ir/view-model'
import type { FoldStorage } from './interface-fold'

/**
 * 合成ルートの層が、いま読んでいるグラフに在るか。
 *
 *   - `unset`: 起動時に指定されていない（または、まだグラフが無い）。操作を出さない
 *   - `missing`: 指定されたが、正本 JSON の `layers[]` に無い。操作を出さず、断る
 *   - `present`: 在る。隠せる
 */
export type CompositionRoot =
  | { kind: 'unset' }
  | { kind: 'missing'; layerId: string }
  | { kind: 'present'; layerId: string; name: string }

/**
 * 指定された層 ID を、読み込んだグラフと照らし合わせる。
 *
 * **照らし合わせは画面が行う**（UT-31 の決定）。正本 JSON は要求のたびに
 * 読み直す（UT-03）ので、起動時に確かめても差し替えれば意味を失う。
 *
 * 一致は ID の完全一致だけ。大文字小文字や名前で寄せない（推測しない / ADR-002）。
 */
export function compositionRootOf(
  viewModel: ViewModel | undefined,
  layerId: string | undefined,
): CompositionRoot {
  if (viewModel === undefined || layerId === undefined) return { kind: 'unset' }

  const layer = viewModel.layerOfKey(layerId)
  if (layer === undefined) return { kind: 'missing', layerId }
  return { kind: 'present', layerId, name: layer.name }
}

/** その粒度で、合成ルートの層に属するノードの ID */
export function compositionRootNodeIds(
  viewModel: ViewModel,
  granularity: Granularity,
  layerId: string,
): ReadonlySet<string> {
  return new Set(
    viewModel.nodes[granularity]
      .filter((node) => viewModel.layerOf(node.id).key === layerId)
      .map((node) => node.id),
  )
}

/**
 * 記憶の鍵。**解析対象ごとに持つ**（ADR-006 決定 3）。
 *
 * UT-29 と同じく `meta.rootDir` を使う。別のリポジトリのグラフを開いたときに、
 * 前の判断を持ち込まない。インターフェースを畳む好みとは別の鍵にする（別の操作）。
 */
export function hideStorageKey(rootDir: string): string {
  return `depenomap:hide-composition-root:${rootDir}`
}

/** 覚えている好み。読めなければ「隠さない」 */
export function readHidePreference(storage: FoldStorage | undefined, rootDir: string): boolean {
  if (storage === undefined) return false

  try {
    return storage.getItem(hideStorageKey(rootDir)) === 'true'
  } catch {
    // 保存が禁止されている環境では、読むだけでも投げる
    return false
  }
}

/**
 * 好みを覚える。**隠さない状態は覚えない**（鍵ごと消す / UT-29 と同じ理由）。
 */
export function writeHidePreference(
  storage: FoldStorage | undefined,
  rootDir: string,
  hidden: boolean,
): void {
  if (storage === undefined) return

  try {
    if (hidden) storage.setItem(hideStorageKey(rootDir), 'true')
    else storage.removeItem(hideStorageKey(rootDir))
  } catch {
    // 覚えられないだけで、隠す操作そのものは成立する
  }
}
