/**
 * 経由の呼び出しを、どちらの行き先で読むか（UT-30 / UT-07 の見直し）。
 *
 * インターフェースを経由する呼び出しは、正本 JSON が 2 つの事実を持っている。
 *
 * - `to` — 型検査器が返した答え（インターフェース）
 * - `implementations` — 抽出側が解決した実装
 *
 * UT-07 は `to` を正として描くと決め、**トグルも置かない**と決めた。しかし DI を
 * 使う構成では、それだけだと**実際にどの層のどのクラスを使っているかが図から
 * 読めない**（`usecase → domain(interface)` の線しか出ず、`usecase → infra` が
 * 図に無い）。どちらでも読めるようにする。
 *
 * **どちらか一方に潰さない**（スキーマ §3 / UT-02 と同じ立場）。読み方を変えれば
 * もう一方が見えるので、正本が持つ事実は消えない。
 *
 * 実装が複数あるときは**全部へ線を引く**（UT-30 の決定）。代表を 1 つ選ぶ基準を
 * ビューアが持つと、正本が言っていない判断を図に載せることになる。
 */

import type { GraphEdge } from '@/core/graph/schema'
import { actualTargetsOf } from '@/core/ir/traversal'

/** どちらの行き先で読むか。既定は型検査器の答え（UT-07 の決定を残す） */
export type ViaReading = 'interface' | 'implementation'

/**
 * 描く 1 本ぶん。
 *
 * **`id` は描く線ごとに固有**（1 本の呼び出しが実装 2 件へ分かれると 2 本になる）
 * だが、循環の判定や説明は**正本のエッジ**に紐づく。そのため元の ID を
 * `sourceId` として残す。
 */
export interface ReadEdge {
  /** 描く線の ID。実装ごとに分かれたぶんだけ派生する */
  id: string
  /** 元になった正本のエッジ ID。循環の判定（`cyclesOfEdge`）はこちらで引く */
  sourceId: string
  from: string
  to: string
  /** 元のエッジ。描き分け（`variantOf`）はこちらを見る */
  edge: GraphEdge
  /** 行き先を実装へ読み替えた線か */
  retargeted: boolean
}

/**
 * 読み方に合わせて、描く線の集合を作る。
 *
 * @param drawable いま図に出ているノードの ID。**実装が図にいなければ読み替え
 *   ない** — 読み替えた先が描けないと、線ごと消えて呼び出しの事実が失われる
 */
export function readEdges(
  edges: readonly GraphEdge[],
  reading: ViaReading,
  drawable: (nodeId: string) => boolean,
): ReadEdge[] {
  return edges.flatMap((edge) => {
    const plain: ReadEdge = {
      id: edge.id,
      sourceId: edge.id,
      from: edge.from,
      to: edge.to,
      edge,
      retargeted: false,
    }

    if (reading !== 'implementation') return [plain]

    /*
     * 実装の引き当ては **IR の規則をそのまま使う**（`actualTargetsOf`）。
     * 経由でないエッジを弾くこと、重複を畳むこと、図にいない実装を外すこと、
     * 1 件も引けなければ `to` に落ちること——どれも同じ判断で、別に書くと
     * 片方でだけずれる。
     */
    const targets = actualTargetsOf(edge, drawable)
    if (targets.length === 1 && targets[0] === edge.to) return [plain]

    return targets.map((to) => ({
      id: `${edge.id}→${to}`,
      sourceId: edge.id,
      from: edge.from,
      to,
      edge,
      retargeted: true,
    }))
  })
}
