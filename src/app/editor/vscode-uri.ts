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
 * 形は `vscode://file/<絶対パス>[:<行>:<桁>]`。**`vscode://file` の直後は `/` で
 * 始まらなければならない** — ここが崩れると、オーソリティとパスの境界が消えた
 * URI になり、ブラウザは黙って何もしない（開けなかったことは返ってこない）。
 *
 * Docker を経由せず Windows で起動すると、`--repo` は `C:\\Users\\me\\app` の形で
 * 通り（`isAbsolute` は真）、ホスト側のパスも区切りが `\\` になる。受け取る側で
 * 揃える。
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
  return posixAbsolute(hostPath).split('/').map(encodeURIComponent).join('/')
}

/** ドライブレターで始まる形（`C:\\...` / `C:/...`）。Windows のパスだけに当たる */
const DRIVE_LETTER = /^[A-Za-z]:[\\/]/

/**
 * 先頭に `/` を置き、Windows のパスなら区切りも揃える。
 *
 * Windows のパス（`C:\\Users\\me\\app`）をそのまま繋ぐと `vscode://fileC:...` に
 * なり、ホスト名の一部として読まれる。
 *
 * **区切りを畳むのは Windows のパスのときだけ。** POSIX では `\` はファイル名に
 * 使える文字であり、無条件に畳むと `a\\b.ts` が `a/b.ts` という**別の場所**を指す。
 * しかも「開ける」と言ったまま渡すことになる。
 */
function posixAbsolute(hostPath: string): string {
  const slashed = DRIVE_LETTER.test(hostPath) ? hostPath.replaceAll('\\', '/') : hostPath
  return slashed.startsWith('/') ? slashed : `/${slashed}`
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
