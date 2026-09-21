<script setup lang="ts">
/**
 * 図の凡例（UT-26 / QR-1）。
 *
 * 線種・色・印の**読み方**を置く。中身は `legend-items.ts` が持ち、ここは
 * 描くだけにする（描き分けを足す UT が 1 か所だけ直せばよいようにする）。
 *
 * **既定は畳んだ状態**（UT-26 の決定）。毎日使う人から図の面積を奪わない。
 * 畳んでいるあいだもボタンは出ているので、初見の人はそこから開ける。
 *
 * 出す層は**いま図に出ているものだけ**（UT-26 の決定）。渡す側が絞る。
 *
 * **良し悪しを書かない**（N-1）。ここに出るのは記号と意味の対応だけで、
 * 件数も評価も持たない。
 */
import { ref } from 'vue'

import { EDGE_LEGEND, type LegendLayer, NODE_LEGEND, STAT_LEGEND } from './legend-items'

defineProps<{ layers: readonly LegendLayer[] }>()

const open = ref(false)
</script>

<template>
  <div class="flex flex-col items-start gap-6">
    <!-- 開いているときだけ板を出す。畳んだ状態ではボタンだけが残る -->
    <section
      v-if="open"
      class="flex max-w-[var(--panel-width)] flex-col gap-11 rounded-panel border border-line bg-surface px-12 py-10 text-caption text-ink-2 shadow-float"
      aria-label="凡例"
    >
      <div v-if="layers.length > 0" class="flex flex-col gap-3">
        <h2 class="text-overline text-ink-3 uppercase">層</h2>
        <p v-for="layer in layers" :key="layer.key" class="flex items-center gap-6">
          <span
            class="h-8 w-8 shrink-0 rounded-micro"
            :style="{ background: layer.colour }"
            aria-hidden="true"
          ></span>
          <span class="truncate">{{ layer.name }}</span>
        </p>
      </div>

      <div class="flex flex-col gap-3">
        <h2 class="text-overline text-ink-3 uppercase">依存の線</h2>
        <p v-for="item in EDGE_LEGEND" :key="item.kind" class="flex items-center gap-6">
          <!-- 見本は図と同じトークンで描く（`LegendPanel.style.node.test.ts` が対応を見る） -->
          <svg class="shrink-0" width="26" height="8" aria-hidden="true">
            <path class="sample" :class="item.kind" d="M1,4 H25" />
            <circle v-if="item.midpoint" class="sample-dot" cx="13" cy="4" />
          </svg>
          <span>{{ item.label }}</span>
        </p>
      </div>

      <div class="flex flex-col gap-3">
        <h2 class="text-overline text-ink-3 uppercase">ノードの印</h2>
        <p v-for="item in NODE_LEGEND" :key="item.label" class="flex items-start gap-6">
          <span class="shrink-0 rounded-micro border border-line px-4 text-ink-3">
            {{ item.label }}
          </span>
          <span>{{ item.meaning }}</span>
        </p>
        <p class="flex items-start gap-6">
          <span class="shrink-0 font-mono text-ink-3">{{ STAT_LEGEND.label }}</span>
          <span>{{ STAT_LEGEND.meaning }}</span>
        </p>
      </div>
    </section>

    <button
      type="button"
      class="rounded-control border border-line bg-surface px-9 py-5 text-meta text-ink-2 shadow-float hover:text-ink"
      :aria-expanded="open"
      :aria-label="open ? '凡例を畳む' : '凡例を開く'"
      :title="open ? '凡例を畳む' : '凡例を開く'"
      @click="open = !open"
    >
      凡例
    </button>
  </div>
</template>

<style scoped>
/*
 * 見本の線。**図（`GraphCanvas.vue`）と同じトークンを使う。**
 *
 * 図の規則は scoped で、そのままは使えない。トークンを共有することで、値を
 * 変えたときに凡例だけ古くなることを防ぐ。対応そのものは
 * `LegendPanel.style.node.test.ts` が見る。
 */
.sample {
  fill: none;
  stroke: var(--color-ink-3);
  stroke-width: var(--edge-stroke);
  opacity: var(--edge-opacity);
}

.sample.implements {
  stroke-width: var(--edge-stroke-implements);
  stroke-dasharray: var(--edge-dash-implements);
  opacity: var(--edge-opacity-implements);
}

.sample.via {
  stroke: var(--color-accent);
  stroke-width: var(--edge-stroke-via);
  opacity: var(--edge-opacity-via);
}

.sample.cyclic {
  stroke: var(--color-warn);
  stroke-width: var(--edge-stroke-cyclic);
  stroke-dasharray: var(--edge-dash-cyclic);
  opacity: 1;
}

.sample-dot {
  fill: var(--color-surface);
  stroke: var(--color-accent);
  stroke-width: var(--via-dot-stroke);
  r: var(--via-dot-radius);
}
</style>
