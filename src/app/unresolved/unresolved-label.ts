/**
 * 追えなかった依存の表記（UT-19 / US-21）。
 *
 * `reason` は正本 JSON のコード値（`dynamic-di-token` など）で、そのままでは
 * 読み手に意味が伝わらない（完了条件）。ここで日本語に読み替える。
 *
 * **「追跡できなかった」であって「ルールに反している」ではない**（N-1）。
 * 文言にも是正の示唆を入れない。原理的にどんなツールでも特定できないものが
 * 含まれる（スキーマ §3）。
 */

import type { Unresolved } from '@/core/graph/schema'

/**
 * 理由のコード値と、その読み替え。
 *
 * 値はスキーマ §3 が挙げているもの。**ここに無いコードは、そのまま出す** —
 * 知らない値を「その他」などに丸めると、正本 JSON が言っていることが画面から
 * 消える。抽出側が新しい理由を足しても、読み手には届く。
 */
const READINGS: Readonly<Record<string, string>> = {
  'dynamic-di-token': 'DI コンテナの文字列トークン',
  'dynamic-import': '動的 import',
  callback: 'コールバック経由の呼び出し',
  'dynamic-property': '動的なプロパティ参照',
}

/** 理由の読み替え。知らないコードはそのまま */
export function readingOf(reason: string): string {
  return READINGS[reason] ?? reason
}

/**
 * 候補の扱い。
 *
 * **候補は推測であり、確定した依存ではない**（スキーマ §3）。0 件もありうる
 * （絞り込めなかった）ので、その形でも破綻しない言い方にする。
 */
export function candidateSummaryOf(unresolved: Unresolved): string {
  const count = unresolved.candidates.length
  return count === 0 ? '行き先の候補は絞り込めていません' : `推測した行き先 ${count} 件`
}
