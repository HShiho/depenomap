<script setup lang="ts">
/**
 * 絞り込み中であることの印（UT-14 / US-12）。
 *
 * 図から消えたノードは、**消えたこと自体が画面から読めない**。何を中心に
 * 絞っているのかと、解く口をここに出す。
 *
 * 依存先の並びが**ソース上の出現順**であることも、ここで伝える（UT-09 / US-05）。
 * 順序が効いているのは絞り込み中だけなので、この印と出る条件が同じになる。
 * **実行順ではない** — 条件分岐やループがあれば一致しない。正本 JSON が持って
 * いない順序を推測しないので（C-7）、そのことを言い切っておく。列見出しは短く
 * 保ちたいので、説明はこちらへ寄せた。
 *
 * 長い識別子でも横へ伸びない。キャンバスの上に重なるので、伸びると図を隠す。
 * **切るのは名前のほう**。説明文を先に落とすと、伝えたい「いま絞り込み中である」
 * が消えて、長い名前だけが残る。
 *
 * 良し悪しは示さない（N-1）。残った数や消えた数を「多い／少ない」として
 * 見せることもしない。
 */
import { useViewState } from '../shell/view-state'

const state = useViewState()

/** 何の順なのかを、推測を混ぜずに言う（C-7 / N-1） */
const ORDER_NOTE =
  '依存先は、ソースに現れた順に並びます。条件分岐やループがあると実行の順序とは一致しません'

defineProps<{ label: string }>()
</script>

<template>
  <div
    class="flex max-w-[var(--panel-width)] items-center gap-7 rounded-round border border-accent-line bg-accent-soft px-10 py-4 text-ink-2 shadow-float"
  >
    <span class="flex min-w-0 items-baseline gap-4 text-meta">
      <b class="min-w-0 truncate font-mono font-semibold text-ink">{{ label }}</b>
      <span class="shrink-0">の周辺だけを表示中</span>
    </span>

    <span class="shrink-0 text-caption text-ink-3" :title="ORDER_NOTE">
      依存先はソース出現順（実行順ではない）
    </span>

    <button
      type="button"
      class="rounded-control px-4 leading-none text-ink-3 hover:text-ink"
      aria-label="絞り込みを解除"
      title="絞り込みを解除"
      @click="state.setNarrowedToSelection(false)"
    >
      ✕
    </button>
  </div>
</template>
