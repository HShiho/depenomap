<script setup lang="ts">
/**
 * 一覧の面（UT-12）。
 *
 * 見出し・並べ替え・一覧をまとめて持つ。並べ替えは**この面の中だけに効く**
 * 表示設定なので、器（UT-05）ではなくここが覚える。ノードマップの並び（UT-08）
 * とは別物で、連動させない。
 *
 * 行に出す印は一覧へ素通しする。UT-10 / UT-11 はこの面を使うだけで、行にも
 * 一覧にも手を入れずに印を足せる。
 *
 * 検索欄（UT-11）はこの並べ替えの上に入る。
 *
 * 畳む口はここ（見出しの隣）とレール（画面の左端）の 2 つある。**同じ状態を
 * 触る**ので、どちらから閉じても同じ。閉じると面ごと見えなくなるため、開き直す
 * 口は面の外＝レールに要る。
 */
import { computed, ref, useId } from 'vue'

import { useViewState } from '../shell/view-state'
import SidebarList from './SidebarList.vue'
import type { SidebarSort } from './sidebar-list'

const state = useViewState()

const sort = ref<SidebarSort>('path')
const sortId = useId()

/** 参照仕様の選択肢はこの 2 つだけ。US-10 が求めるのは被依存数の降順 */
const options: { value: SidebarSort; label: string }[] = [
  { value: 'path', label: 'パス順' },
  { value: 'fan-in', label: '被依存数（降順）' },
]

const fileCount = computed(() => state.viewModel?.nodes.file.length ?? 0)
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 items-center border-b border-line px-12 py-9">
      <h2 class="text-overline text-ink-3 uppercase">ファイル / メソッド</h2>

      <div class="grow"></div>

      <button
        type="button"
        class="rounded-control px-6 py-3 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
        aria-label="一覧を閉じる"
        title="一覧を閉じる"
        @click="state.sidebarOpen = false"
      >
        ‹
      </button>
    </div>

    <div class="flex shrink-0 items-center justify-between gap-8 border-b border-line px-12 py-9">
      <label class="sr-only" :for="sortId">並べ替え</label>
      <select
        :id="sortId"
        v-model="sort"
        class="rounded-inner border border-line bg-surface-2 px-8 py-4 text-meta text-ink-2"
      >
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <span class="text-caption text-ink-3">{{ fileCount }} ファイル</span>
    </div>

    <div class="min-h-0 grow overflow-y-auto">
      <SidebarList :sort="sort">
        <template #file-badges="{ node }">
          <slot name="file-badges" :node="node" />
        </template>
        <template #method-badges="{ node }">
          <slot name="method-badges" :node="node" />
        </template>
      </SidebarList>
    </div>
  </div>
</template>
