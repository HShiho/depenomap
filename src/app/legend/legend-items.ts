/**
 * 図の描き分けの一覧（UT-26 / QR-1）。
 *
 * このビューアは依存の形を**線種と色と印**で描き分けているが、その読み方は
 * どこにも出ていなかった。ここが「見た目」と「意味」の対応を持つ 1 か所になる。
 *
 * **新しい描き分けを足す UT は、ここに 1 行足す。** 足し忘れると、図には出て
 * いるのに凡例に無い、という食い違いが静かにできる（UT-26 が公開する契約）。
 *
 * **語は既にある定数から取る。** 印の文言（`循環` / `未追跡`）を直書きすると、
 * 図と凡例で別のことを言いうる。
 *
 * **良し悪しを書かない**（N-1）。「多い」「望ましい」の語をここに入れない。
 */

import { CYCLE_LABEL, TYPE_ONLY_LABEL } from '@/app/shell/cycle-mark'
import type { LayerKey } from '@/core/ir/view-model'
import type { ViaReading } from '@/app/shell/view-state'
import { UNRESOLVED_LABEL } from '@/app/shell/node-flag'

/**
 * 凡例に出す層。**図が渡す**（いま出ている層だけ / UT-26 の決定）。
 *
 * 名前と色は層の見せ方を持つ場所（`shell/layer-colour.ts`）から引いたものを
 * そのまま受け取る。凡例が引き直すと、図と凡例で色がずれうる。
 */
export interface LegendLayer {
  /** 層のキー。層が無いノードのぶんは `NO_LAYER`（Symbol）で来る */
  key: LayerKey
  name: string
  colour: string
}

/**
 * 線の見本。`kind` は図のエッジに付く class と同じ語で、凡例の見本も同じ
 * スタイルで描く（別のスタイルを当てると、凡例だけ違う線になる）。
 */
export interface EdgeLegendItem {
  /** `GraphCanvas` のエッジに付く class と同じ */
  kind: 'plain' | 'implements' | 'via' | 'cyclic'
  label: string
  /** 中点の印を持つか（interface 経由だけ） */
  midpoint: boolean
}

/**
 * 線の読み方。並びは「ふつうの依存 → 形の違い」の順。
 *
 * **経由の行き先は読み方で変わる**（UT-30）ので、いまの読み方を受け取る。
 * 固定の文言にすると、実装宛で読んでいるあいだ凡例が図と逆のことを言う。
 */
export function edgeLegendOf(reading: ViaReading): readonly EdgeLegendItem[] {
  return [
    { kind: 'plain', label: '確定した依存', midpoint: false },
    { kind: 'implements', label: 'implements（クラス → インターフェース）', midpoint: false },
    {
      kind: 'via',
      label:
        reading === 'implementation'
          ? 'インターフェース経由の呼び出し（行き先は実装）'
          : 'インターフェース経由の呼び出し（行き先はインターフェース）',
      midpoint: true,
    },
    { kind: 'cyclic', label: '循環に含まれる依存', midpoint: false },
  ]
}

/** ノードに出る印の読み方 */
export interface NodeLegendItem {
  label: string
  meaning: string
}

export const NODE_LEGEND: readonly NodeLegendItem[] = [
  { label: CYCLE_LABEL, meaning: '循環に含まれるノード' },
  { label: TYPE_ONLY_LABEL, meaning: '属する循環がすべて型のみ（実行時に値のやり取りが起きない）' },
  { label: UNRESOLVED_LABEL, meaning: '静的に追えなかった呼び出しの出どころ' },
]

/**
 * ノードの右下に出る数値の印。**図もここから引く**（`GraphCanvas` の `statsOf`）。
 * 直書きすると、記号を変えたときに凡例だけ古くなる。
 */

/**
 * ノードの右下に出る数値の読み方。
 *
 * **数え方まで書く。** 同じ 2 ノード間に何本エッジがあっても 1 と数える
 * （UT-02 の決定）ので、線の本数を数えても一致しない。
 */
export const FAN_IN_MARK = '↙'
export const FAN_OUT_MARK = '↗'

export const STAT_LEGEND = {
  label: `${FAN_IN_MARK} 被依存数 ／ ${FAN_OUT_MARK} 依存数`,
  meaning: '同じ相手との依存は、何本あっても 1 と数える',
} as const
