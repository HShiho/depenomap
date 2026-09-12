<script setup lang="ts">
/**
 * 一覧のファイル行（UT-12 / US-09）。
 *
 * 開閉の状態は持たない。開いているかどうかは一覧（`SidebarList`）が決め、
 * ここは受け取って見せるだけにする。行が自分で覚えると、並べ替えや絞り込みで
 * 行が作り直されたときに状態が消える。
 *
 * `badges` スロットは、循環の印（UT-10）と検索の一致（UT-11）の差し込み先。
 * **選択のボタンの外に置く** — 中に入れると、押せる印（循環へ飛ぶ、一致箇所へ
 * 飛ぶ）を差し込んだ時点でボタンが入れ子になり、HTML として不正になるうえ、
 * 印を押しただけで選択も動く。
 */
import { computed } from 'vue'

import type { FileNode } from '@/core/graph/schema'
import FanInBadge from './FanInBadge.vue'

const props = defineProps<{
  node: FileNode
  fanIn: number
  open: boolean
  /**
   * 閉じられない理由（`SidebarList` の不変条件）。中のメソッドが見えている
   * ことに意味がある行は閉じない。
   *
   * `disabled` にはしない。フォーカスできなくなり、キーボードで辿る人には
   * キャレットが消えたようにしか見えず、理由に到達できない。押せないことは
   * `aria-disabled` で伝え、押しても何も起きない形にする。
   */
  pinned?: 'selected' | 'matched'
  selected: boolean
  colour: string
}>()

defineEmits<{ toggle: []; select: [] }>()

/** 閉じられない理由の文言 */
const pinnedReason = computed(() =>
  props.pinned === 'selected' ? '選択中のメソッドを含むため' : '検索に一致したメソッドを含むため',
)

/**
 * ファイル名の後ろに出す、置き場所（末尾のファイル名を除いたパス）。
 *
 * **区切りが無いときは空にする**。`rootDir` 直下のファイル（`index.ts` など）は
 * パスとファイル名が同じで、そのまま出すと名前を 2 回並べることになる。
 */
function directoryOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}
</script>

<template>
  <div class="flex w-full items-center">
    <!--
      開閉と選択は別の操作。1 つのボタンに載せると、一覧から選ぼうとするたびに
      メソッドが開き、開きたいだけのときに選択が動く
    -->
    <button
      type="button"
      class="shrink-0 rounded-control px-4 py-4 text-ink-3 hover:text-ink aria-disabled:opacity-50 aria-disabled:hover:text-ink-3"
      :aria-expanded="open"
      :aria-disabled="pinned ? 'true' : undefined"
      :aria-label="
        pinned
          ? `${node.name} は${pinnedReason} 閉じられない`
          : open
            ? `${node.name} のメソッドを閉じる`
            : `${node.name} のメソッドを開く`
      "
      :title="pinned ? `${pinnedReason} 閉じられません` : undefined"
      @click="pinned || $emit('toggle')"
    >
      <span class="inline-block transition-transform" :class="{ 'rotate-90': open }">›</span>
    </button>

    <button
      type="button"
      :data-node-id="node.id"
      class="flex min-w-0 grow items-center gap-7 rounded-item py-6 pl-8 text-left"
      :class="selected ? 'bg-accent-soft' : 'hover:bg-surface-2'"
      :aria-current="selected ? 'true' : undefined"
      @click="$emit('select')"
    >
      <!-- 層の色帯。ノードマップの色帯と同じ規則（ADR-002 / UT-04） -->
      <span class="h-17 w-3 shrink-0 rounded-micro" :style="{ background: colour }"></span>

      <span class="min-w-0 grow truncate font-mono text-name">
        {{ node.name }}
        <span class="text-caption text-ink-3">{{ directoryOf(node.path) }}</span>
      </span>
    </button>

    <div class="flex shrink-0 items-center gap-7 pr-8">
      <slot name="badges" />
      <FanInBadge :count="fanIn" />
    </div>
  </div>
</template>
