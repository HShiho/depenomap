import { readFile } from 'node:fs/promises'

import { loadGraphFromValue, type LoadResult } from './loader'

/**
 * ファイルパスから正本 JSON を読み込む。
 *
 * `node:fs` に依存するため **Node でしか動かない**。`src/core/` は画面と
 * サーバーの両方から使う場所（ADR-005）なので、プラットフォーム依存を
 * ファイル名（`*.node.ts`）で明示し、画面側の型検査対象から外している。
 *
 * 画面はファイルを読まない。グラフは UT-03 が HTTP で渡す。
 */
export async function loadGraphFromFile(path: string): Promise<LoadResult> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (cause) {
    return {
      ok: false,
      warnings: [],
      errors: [{ type: 'read-failed', path, message: (cause as Error).message }],
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (cause) {
    return {
      ok: false,
      warnings: [],
      errors: [{ type: 'invalid-json', path, message: (cause as Error).message }],
    }
  }

  return loadGraphFromValue(raw)
}
