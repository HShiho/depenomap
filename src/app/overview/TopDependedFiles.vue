<script setup lang="ts">
/**
 * 被依存数の多いファイル（UT-13 / US-11）。
 *
 * 棒の長さは使われている数、色の内訳は**どの層から使われているか**。1 つの層
 * からしか使われていないファイルと、層をまたいで広く使われているファイルとでは、
 * 変えたときの影響の広がりかたが違う（参照仕様）。
 *
 * **数に良し悪しを付けない**（N-1）。多いことを問題として扱わず、目安との比較も
 * 出さない。並べるのは「大きい順に見たい」からで、上位が悪いという意味ではない。
 *
 * 並びも内訳も IR が持つ（`nodesByFanInDesc` / `fanInByLayerOf`）。ここで数え直すと、
 * 同じ値がサイドバーの被依存数と食い違いうる。
 *
 * 行から図へ移れる。**移動の経路は UT-14 のものを通す**（ここは導線を差し込むだけ）。
 */
import { computed } from 'vue'

import { NO_LAYER, type LayerKey } from '@/core/ir/view-model'
import { layerColours } from '../shell/layer-colour'
import { useViewState } from '../shell/view-state'

/** 出す件数（参照仕様）。ここは概要で、一覧は作らない（N-4） */
const TOP_COUNT = 8

const emit = defineEmits<{ move: [nodeId: string] }>()

const state = useViewState()

const rows = computed(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return []

  const colourOf = layerColours(viewModel)
  const nameOfLayer = (key: LayerKey) =>
    key === NO_LAYER ? '層なし' : (viewModel.layerOfKey(key)?.name ?? String(key))

  return viewModel
    .nodesByFanInDesc('file')
    .slice(0, TOP_COUNT)
    .map((node) => {
      const fanIn = viewModel.fanInOf(node.id, 'file')
      const byLayer = [...viewModel.fanInByLayerOf(node.id, 'file')].map(([key, count]) => ({
        key,
        count,
        name: nameOfLayer(key),
        colour: colourOf(key),
      }))
      return { node, fanIn, byLayer }
    })
})

/** 棒の長さの基準。最も多いものを満幅にする */
const max = computed(() => rows.value.reduce((top, row) => Math.max(top, row.fanIn), 1))
</script>

<template>
  <div>
    <ul class="flex flex-col gap-5">
      <li v-for="row in rows" :key="row.node.id" class="flex items-center gap-9">
        <button
          type="button"
          class="w-[180px] shrink-0 truncate rounded-item px-5 py-3 text-left font-mono text-meta text-ink hover:bg-surface-2"
          :data-node-id="row.node.id"
          :title="row.node.path"
          @click="emit('move', row.node.id)"
        >
          {{ row.node.name }}
        </button>

        <span class="flex h-11 grow overflow-hidden rounded-micro bg-surface-2">
          <i
            v-for="part in row.byLayer"
            :key="String(part.key)"
            class="h-full"
            :style="{ flexGrow: part.count, background: part.colour }"
            :title="`${row.node.name} ← ${part.name} から ${part.count}`"
          ></i>
          <!-- 余りぶん。棒の長さを件数どうしで比べられるようにする -->
          <i class="h-full" :style="{ flexGrow: max - row.fanIn }"></i>
        </span>

        <span class="w-[32px] shrink-0 text-right font-mono text-caption text-ink-3 tabular-nums">
          {{ row.fanIn }}
        </span>
      </li>
    </ul>

    <p class="mt-7 text-caption text-ink-3">
      棒の長さは使われている数、色の内訳はどの層から使われているかです。上位
      {{ TOP_COUNT }} 件を出しています。行を押すとそのファイルへ移ります。
    </p>
  </div>
</template>
