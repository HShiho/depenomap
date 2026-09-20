/**
 * ノードの相対パスから、ホスト側で開ける位置を求める（UT-20 / ADR-004）。
 *
 * ノードの `path` は `meta.rootDir` からの相対で、**画面が動く場所と実ファイルが
 * 在る場所は違う**。この突き合わせをサーバーが引き受けることで、画面は相対パス
 * だけを扱えばよくなる。
 *
 * 存在を確かめるのはこのプロセスから見える側（`mountPath`）、返すのはホストから
 * 見える側（`hostPath`）。**同じ場所を 2 つの名前で指す**。
 *
 * 結果の形（`LocateResult`）は `core/graph/api.ts` に置く。**画面（UT-18）も同じ形を
 * 読む**ためで、画面が `src/server/` を import する形にすると境界の向きが崩れる。
 *
 * **開けるかどうかの判定はしない**（N-1）。存在を確かめるところまでで、それ以上の
 * 評価（正しいファイルか、読めるか）はしない。解決できないことも欠陥ではない。
 */

import { isAbsolute, join, normalize, sep } from 'node:path'

import type { LocateResult } from '../core/graph/api'
import type { RepoMount } from './config'

/**
 * リポジトリの外を指していないか。
 *
 * `../` を畳んだ結果がリポジトリの外を向いていたら受け取らない。ノードの
 * `path` は正本 JSON が持つ値で、**このサーバーはその中身を検査しない立場**
 * （N-1）なので、受け取る側で線を引く。
 */
function isInsideRepo(relative: string): boolean {
  if (relative === '' || isAbsolute(relative)) return false

  const normalized = normalize(relative)
  return normalized !== '..' && !normalized.startsWith(`..${sep}`)
}

/**
 * @param exists このプロセスから見える位置に実体があるか。実ファイルを見る手段は
 *   呼び出し側から渡す（この関数を描画抜き・ファイル抜きで検査できるようにする）
 */
export function locate(
  repo: RepoMount | undefined,
  relativePath: string,
  exists: (path: string) => boolean,
): LocateResult {
  if (repo === undefined) return { resolved: false, reason: 'no-repo' }
  if (!isInsideRepo(relativePath)) return { resolved: false, reason: 'bad-path' }

  const normalized = normalize(relativePath)
  return {
    resolved: true,
    hostPath: join(repo.hostPath, normalized),
    exists: exists(join(repo.mountPath, normalized)),
  }
}
