<script setup lang="ts">
/**
 * 絞り込み中であることの印（UT-14 / US-12）。
 *
 * 図から消えたノードは、**消えたこと自体が画面から読めない**。何を中心に
 * 絞っているのかと、解く口をここに出す。
 *
 * 呼び出しと生成の並びが**ソース上の出現順**であることも、ここで伝える
 * （UT-09 / US-05）。順序を持つのはその 2 つだけなので、文言もそこに限る。
 * 順序が効いているのは絞り込み中だけなので、この印に添える場所がある。ただし
 * **効いているときだけ出す** — 材料（`sourceOrder`）を持つ依存先が無ければ、
 * 並びは出現順を表していない。出す・出さないの判定は呼ぶ側が持つ。
 * **実行順ではない** — 条件分岐やループがあれば一致しない。正本 JSON が持って
 * いない順序を推測しないので（C-7）、そのことを言い切っておく。列見出しは短く
 * 保ちたいので、説明はこちらへ寄せた。
 *
 * 長い識別子でも横へ伸びない。キャンバスの上に重なるので、伸びると図を隠す。
 * **切るのは名前のほう**。説明文を先に落とすと、伝えたい「いま絞り込み中である」
 * が消えて、長い名前だけが残る。
 *
 * **断りは名前と同じ行に置かない。** 横に並べると、名前を幅 0 まで潰しても
 * 最小の幅が上限（`--panel-width`）を超え、枠の外へ文字がはみ出す。行を分ければ
 * どちらも上限の中に収まり、名前だけが縮む形も保てる。
 *
 * 良し悪しは示さない（N-1）。残った数や消えた数を「多い／少ない」として
 * 見せることもしない。
 */
import { useViewState } from '../shell/view-state'

const state = useViewState()

/** 何の順なのかを、推測を混ぜずに言う（C-7 / N-1） */
const ORDER_NOTE =
  '呼び出しと生成は、ソースに現れた順に並びます。条件分岐やループがあると実行の順序とは一致しません。順序を持たない import と implements は、その後ろに置きます'

defineProps<{
  label: string
  /** 依存先の並びについての断りを出すか。順序が効いていないときは出さない */
  orderNote: boolean
}>()
</script>

<template>
  <div
    class="flex max-w-[var(--panel-width)] items-center gap-7 rounded-round border border-accent-line bg-accent-soft px-10 py-4 text-ink-2 shadow-float"
  >
    <span class="flex min-w-0 flex-col gap-2">
      <span class="flex min-w-0 items-baseline gap-4 text-meta">
        <b class="min-w-0 truncate font-mono font-semibold text-ink">{{ label }}</b>
        <span class="shrink-0">の周辺だけを表示中</span>
      </span>

      <span v-if="orderNote" class="truncate text-caption text-ink-3" :title="ORDER_NOTE">
        呼び出し・生成はソース出現順（実行順ではない）
      </span>
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
