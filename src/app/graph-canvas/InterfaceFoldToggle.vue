<script setup lang="ts">
/**
 * インターフェースのノードを畳む切り替え（UT-29 / UT-30 の後段）。
 *
 * **実装宛で読んでいるとき（UT-30）だけ効く。** その読み方では呼び出しの線が
 * 実装へ向かうので、インターフェースのノードは線の通らない点として残る。
 * インターフェース宛では線が interface を通っており、畳むと呼び出しの事実が
 * 図から消える。
 *
 * メソッド粒度でしか対象が無い。効かない場面では**押せない状態にして、その
 * 理由を画面に出す**（口ごと消すと、機能が無いのか効かないのかが分からない）。
 *
 * 畳んでいるかは器（UT-05）が持ち、解析対象ごとに覚える。
 */
import { computed, useId } from 'vue'

import { useViewState } from '../shell/view-state'

const state = useViewState()

/** 効かない理由。効くときは `undefined` */
const blocked = computed(() => {
  if (state.granularity !== 'method') return 'メソッド粒度で使えます'
  if (state.viaReading !== 'implementation') return '経由の行き先を実装にすると使えます'
  return undefined
})

const label = computed(() =>
  blocked.value === undefined
    ? 'インターフェースのノードを畳む'
    : `インターフェースのノードを畳む（${blocked.value}）`,
)

const describedId = useId()
</script>

<template>
  <div class="flex shrink-0 items-center gap-6">
    <button
      type="button"
      class="flex shrink-0 items-center gap-6 rounded-control px-8 py-5 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:text-line disabled:hover:bg-transparent"
      :disabled="blocked !== undefined"
      :aria-pressed="state.interfacesFolded"
      :aria-label="label"
      :aria-describedby="blocked !== undefined ? describedId : undefined"
      @click="state.setInterfacesFolded(!state.interfacesFolded)"
    >
      <span
        class="inline-block min-w-11 rounded-micro border px-4 text-center leading-none"
        :class="
          state.interfacesFolded ? 'border-accent-line bg-accent-soft text-accent' : 'border-line'
        "
        aria-hidden="true"
      >
        {{ state.interfacesFolded ? '✓' : '' }}
      </span>
      interface を畳む
    </button>

    <!-- 効かない理由。見えるところに出し、口と結び付ける -->
    <span v-if="blocked !== undefined" :id="describedId" class="text-caption text-ink-3">
      {{ blocked }}
    </span>
  </div>
</template>
