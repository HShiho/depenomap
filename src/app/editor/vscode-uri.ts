/**
 * VSCode で開くための URI を組み立てる（UT-18 / US-19）。
 *
 * **コンテナの中からホストの VSCode は起動できない**（ADR-004）。ブラウザに
 * `vscode://` を渡し、ホスト側の OS に取り次いでもらう。したがって
 * **開けたかどうかはこちらには返ってこない** — 取り次ぎに失敗しても、VSCode が
 * 入っていなくても、ブラウザは黙っている。開けなかったことを欠陥として扱わない
 * （N-1）ので、それで困らない形にしておく。
 *
 * 渡すのは**ホストから見た絶対パス**（`/api/locate` の `hostPath`）。コンテナの
 * 中の位置を渡しても、そのパスはホストには無い。
 *
 * 形は `vscode://file/<絶対パス>[:<行>:<桁>]`。パスは POSIX の絶対パスを前提と
 * する（`--repo` は `node:path` の `isAbsolute` を通っている / UT-20）。
 */

/** 行位置。抽出側が 1-based に補正済みの値（スキーマ §3） */
export interface Position {
  line: number
  column: number
}

/**
 * パスを URI に載せられる形にする。
 *
 * **区切りの `/` は残し、それ以外を符号化する。** 空白や `#` をそのまま載せると、
 * そこで URI が切れて別の場所を指す。`encodeURIComponent` を丸ごとかけると
 * 区切りまで `%2F` になるため、区切りごとに分けてかける。
 */
function encodePath(hostPath: string): string {
  return hostPath.split('/').map(encodeURIComponent).join('/')
}

/**
 * 開く先の URI。
 *
 * @param hostPath ホストから見た絶対パス（`/api/locate` の `hostPath`）
 * @param position 行位置。渡さなければ位置を指定しない（VSCode が前回の位置で開く）
 */
export function vscodeUriOf(hostPath: string, position?: Position): string {
  const base = `vscode://file${encodePath(hostPath)}`
  return position === undefined ? base : `${base}:${position.line}:${position.column}`
}
