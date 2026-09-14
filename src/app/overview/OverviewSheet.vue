<script setup lang="ts">
/**
 * 概要（UT-13 / US-11）。
 *
 * 個々のノードを追う前に、規模と大まかな構成を掴む場所。**出すのは事実の
 * 集計だけ**で、違反件数・指摘・ルール別の内訳は持たない（N-1）。層をまたぐ
 * 依存も「どれだけ流れているか」を示すだけで、向きの正誤は判定しない。
 *
 * **書き出す口は持たない**（N-5）。画面上で把握するもの。
 *
 * 集計は IR から取る（完了条件）。ここで数え直すと、同じ値がサイドバーや図と
 * 食い違いうる。
 *
 * 起動直後ではなく**いつでも開けるシート**にしてある（UT-13 の決定）。読み込んだ
 * 直後に図が見えることを優先し、概要は必要なときに重ねる。参照仕様も同じ形。
 */
import { computed } from 'vue'

import GraphIdentity from './GraphIdentity.vue'
import { shortCommit, formatGeneratedAt } from './overview-format'
import { useViewState } from '../shell/view-state'

const emit = defineEmits<{ close: [] }>()

const state = useViewState()

const meta = computed(() => state.viewModel?.meta)

/** 見出しに出す 1 行。素性のうち、どの断面かが分かるだけを短く */
const subtitle = computed(() => {
  const found = meta.value
  if (found === undefined) return ''
  const at = formatGeneratedAt(found.generatedAt)
  return `${found.snapshot.label} ・ ${shortCommit(found.snapshot.commit)} ・ ${at}`
})
</script>

<template>
  <!--
    背景の覆い。押すと閉じる。シートの外側を押して閉じられないと、
    レールのボタンまで戻らないと閉じられなくなる
  -->
  <div
    class="fixed inset-0 z-10 flex justify-center bg-ground/70 p-24 backdrop-blur-[2px]"
    @click.self="emit('close')"
  >
    <section
      class="flex max-h-full w-full max-w-[900px] flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-float"
      role="dialog"
      aria-modal="true"
      aria-label="依存関係の概要"
    >
      <header class="flex shrink-0 items-start gap-9 border-b border-line px-16 py-12">
        <div class="min-w-0">
          <h2 class="text-title text-ink">依存関係の概要</h2>
          <p class="mt-2 truncate font-mono text-caption text-ink-3">{{ subtitle }}</p>
        </div>

        <div class="grow"></div>

        <button
          type="button"
          class="rounded-control px-6 py-2 leading-none text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label="概要を閉じる"
          title="概要を閉じる"
          @click="emit('close')"
        >
          ✕
        </button>
      </header>

      <div class="min-h-0 grow overflow-y-auto px-16 py-14">
        <section v-if="meta !== undefined">
          <h3 class="mb-8 text-overline text-ink-3 uppercase">このグラフの素性</h3>
          <GraphIdentity :meta="meta" />
        </section>
      </div>
    </section>
  </div>
</template>
