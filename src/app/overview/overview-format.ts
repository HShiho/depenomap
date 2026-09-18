/**
 * 概要に出す値の書式（UT-13 / US-11）。
 *
 * IR は正本 JSON の `meta` をそのまま持つ（加工しない）。読ませ方の判断は
 * こちら側の仕事なので、書式を純粋関数に出して、描画抜きで検査できるようにする。
 *
 * **値を作らない。** 無い値を「不明」などで埋めず、そのまま出す。正本 JSON が
 * 言っていないことを画面で足さない。
 */

/** 表示に使う commit の桁数。先頭からこれだけ出す（参照仕様） */
export const COMMIT_DIGITS = 7

/**
 * commit を短く見せる。
 *
 * 全文はそのまま読めるところ（素性の表）に出す。ここで短くするのは見出しの
 * 1 行に収めるためで、**短いほうだけを出す場所を作らない**。
 */
export function shortCommit(commit: string): string {
  return commit.slice(0, COMMIT_DIGITS)
}

/**
 * 生成日時。ISO 8601 を読みやすい表記にする。
 *
 * **解釈できない文字列は、そのまま返す。** 抽出側が何を入れてくるかは
 * ビューアの保証の外で、解釈できないことを理由に値を捨てると、素性を
 * 確かめにきた読み手から情報が消える。
 */
export function formatGeneratedAt(iso: string, locale = 'ja-JP'): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return at.toLocaleString(locale)
}

/**
 * 全体に占める割合（百分率）。
 *
 * 母数が 0 のときは 0 を返す。ノードが 1 件も無いグラフでも構成比の表示が
 * 破綻しないようにするため（完了条件）。
 */
export function percentOf(count: number, total: number): number {
  return total === 0 ? 0 : (count / total) * 100
}
