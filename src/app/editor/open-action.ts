/**
 * 「VSCode で開く」を押せるか、押せないなら何が足りないか（UT-18 / US-19）。
 *
 * 開く先が決まるまでに 3 つの段がある。**どれも成立しないことがふつうに
 * 起こる**ので、段ごとに何が足りないのかを言えるようにする。
 *
 * ```
 *   ノード ──▶ 開く先（相対パス）──▶ ホスト側の位置 ──▶ URI
 *              所属ファイルが要る     --repo が要る      実体が要る
 * ```
 *
 * **開けないことを欠陥として扱わない**（N-1）。文言にも是正の示唆を入れない。
 * 図を読むだけなら `--repo` は渡さなくてよく、実体が無いのは正本 JSON を
 * 取ってからファイルが動いただけかもしれない。
 *
 * 理由は**押す前に**読める場所へ出す（UT-18 の決定）。押してから知らせると、
 * 押した操作が効いたのかどうかが分からない。
 */

import type { FetchLocateOutcome } from '@/core/graph/api'

import type { OpenTarget } from './open-target'
import { vscodeUriOf } from './vscode-uri'

export type OpenAction =
  /** 位置を問い合わせている最中 */
  | { kind: 'asking' }
  /** 開ける。`uri` をブラウザに渡す */
  | { kind: 'ready'; uri: string; hostPath: string }
  /** 開けない。`reason` はそのまま画面に出す文言 */
  | { kind: 'blocked'; reason: string }

/**
 * 開く導線の状態を決める。
 *
 * @param target 開く先。`undefined` は、ノードから開く先が決まらなかったこと
 * @param outcome 位置の問い合わせの結果。`undefined` は、まだ返ってきていないこと
 */
export function openActionOf(
  target: OpenTarget | undefined,
  outcome: FetchLocateOutcome | undefined,
): OpenAction {
  if (target === undefined) {
    return { kind: 'blocked', reason: '所属ファイルが正本 JSON に無いため、開く先を決められない' }
  }

  if (outcome === undefined) return { kind: 'asking' }

  // サーバーに届かなかった。正本 JSON の問題でも、渡し方の問題でもない
  if (!outcome.reached) {
    return { kind: 'blocked', reason: `位置を問い合わせられなかった: ${outcome.message}` }
  }

  const located = outcome.result
  if (!located.resolved) {
    return {
      kind: 'blocked',
      reason:
        located.reason === 'no-repo'
          ? '解析対象リポジトリが渡されていない（起動時の --repo）'
          : `このノードのパスからは位置を決められない: ${target.path}`,
    }
  }

  /*
   * 実体が無いときも位置は返る（UT-20）。**ここで開かせない。** VSCode は
   * 無いファイルを開こうとすると空のエディタを作り、それが正本 JSON の言う
   * ファイルなのか、いま作られた空のものなのかが読み手には区別できない。
   */
  if (!located.exists) {
    return { kind: 'blocked', reason: `ホスト側に実体が見つからない: ${located.hostPath}` }
  }

  return {
    kind: 'ready',
    uri: vscodeUriOf(located.hostPath, target.loc),
    hostPath: located.hostPath,
  }
}
