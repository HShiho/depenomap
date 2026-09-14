<script setup lang="ts">
/**
 * 層をまたぐ依存の流れ（UT-13 / US-11）。
 *
 * 行が呼ぶ側、列が呼ばれる側。層は `layerKeys` の順に置くので、**対角より
 * 右上が「並びの上から下」、左下が「下から上」**へ向かう依存にあたる。
 *
 * **どの向きが正しいかは判定しない**（N-1）。上下という言い方も並びの上下で
 * あって、良し悪しではない。違反という語も、あるべき向きも出さない。
 *
 * 数は IR が数える（`layerFlows`）。ここは置くだけ。同じ層の中は数に入らない
 * （「またぐ」もの）ので、対角は空欄にする。
 *
 * 濃さは本数。上限を抑えて、明・暗どちらのテーマでも文字が読める範囲に収める
 * （参照仕様）。
 */
import { computed } from 'vue'

import { NO_LAYER, type LayerKey } from '@/core/ir/view-model'
import { layerColours } from '../shell/layer-colour'
import { useViewState } from '../shell/view-state'

const state = useViewState()

/** 濃さの下限と幅（％）。0 からにすると 1 本のセルが地と見分けられない */
const TINT_MIN = 12
const TINT_RANGE = 38

interface Matrix {
  layers: readonly { key: LayerKey; name: string; colour: string }[]
  /** 層の組ごとの本数。数えるのは IR で、ここは引くだけ */
  countOf: (from: LayerKey, to: LayerKey) => number
  /** 濃さの基準に使う最大の本数 */
  max: number
}

const matrix = computed<Matrix>(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return { layers: [], countOf: () => 0, max: 1 }

  const colourOf = layerColours(viewModel)
  // 型は明示する。`layerKeys` を map すると `NO_LAYER` が symbol へ広がる
  const layers = viewModel.layerKeys.map((key): Matrix['layers'][number] => ({
    key,
    name: key === NO_LAYER ? '層なし' : (viewModel.layerOfKey(key)?.name ?? String(key)),
    colour: colourOf(key),
  }))

  const flows = viewModel.layerFlows('file')
  /*
   * 組を 1 つの文字列に潰さない。層 ID に区切り文字が入っていると別の組と
   * 同じキーになり、本数が混ざる（IR 側と同じ理由）。
   */
  const counts = new Map<LayerKey, Map<LayerKey, number>>()
  for (const flow of flows) {
    let row = counts.get(flow.from)
    if (row === undefined) {
      row = new Map()
      counts.set(flow.from, row)
    }
    row.set(flow.to, flow.count)
  }
  const max = flows.reduce((top, flow) => Math.max(top, flow.count), 1)

  return {
    layers,
    countOf: (from: LayerKey, to: LayerKey) => counts.get(from)?.get(to) ?? 0,
    max,
  }
})

/** 本数に応じた面の濃さ。アクセントに寄せるだけで、色で良し悪しを分けない */
function tintOf(count: number): string {
  const ratio = TINT_MIN + (count / matrix.value.max) * TINT_RANGE
  return `color-mix(in srgb, var(--color-accent) ${Math.round(ratio)}%, var(--color-surface-2))`
}
</script>

<template>
  <div>
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-caption">
        <thead>
          <tr>
            <th scope="col" class="py-4 pr-9 text-left font-normal text-ink-3">
              呼ぶ側 ↓ ／ 呼ばれる側 →
            </th>
            <th
              v-for="layer in matrix.layers"
              :key="String(layer.key)"
              scope="col"
              class="min-w-[84px] px-4 py-4 font-semibold"
              :style="{ color: layer.colour }"
            >
              {{ layer.name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="from in matrix.layers" :key="String(from.key)">
            <th
              scope="row"
              class="py-4 pr-9 text-left font-semibold whitespace-nowrap"
              :style="{ color: from.colour }"
            >
              {{ from.name }}
            </th>

            <template v-for="to in matrix.layers" :key="String(to.key)">
              <!-- 同じ層の中は数えていない。空欄にして、0 本と見分ける -->
              <td
                v-if="from.key === to.key"
                class="border border-line-2 bg-surface-3 text-center text-ink-3"
                aria-label="同じ層の中"
              >
                ―
              </td>
              <td
                v-else
                class="border border-line-2 text-center text-ink-2 tabular-nums"
                :style="{
                  background:
                    matrix.countOf(from.key, to.key) === 0
                      ? ''
                      : tintOf(matrix.countOf(from.key, to.key)),
                }"
                :title="`${from.name} → ${to.name} ${matrix.countOf(from.key, to.key)} 本`"
              >
                {{ matrix.countOf(from.key, to.key) }}
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-7 text-caption text-ink-3">
      行が呼ぶ側、列が呼ばれる側です。層は上の「層の構成」と同じ順に置いてあります。
      「―」は同じ層の中（ここでは数えていません）。どの向きが正しいかの判定はしません。
    </p>
  </div>
</template>
