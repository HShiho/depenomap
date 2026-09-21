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
/**
 * 効かない理由。効くときは `undefined`。
 *
 * 覚えた好みが立ったままここへ来ることがあるので、そのときは**いま効いて
 * いない**ことも言う。
 */
const blocked = computed(() => {
  const kept = state.interfacesFolded ? `畳む設定は残っています。` : ``
  if (state.granularity !== 'method') return `${kept}メソッド粒度で使えます`
  if (state.viaReading !== 'implementation') return `${kept}経由の行き先を実装にすると使えます`
  return undefined
})
/**
 * いま畳みが効いているか。**効いていなければ押下状態も出さない。**
 *
 * 覚えた好み（`interfacesFolded`）は粒度や読み方を変えても保つが、効かない
 * 場面でチェックを出すと、画面が「畳んでいる」と「畳んでいない」を同時に
 * 主張することになる（断りは出ない）。
 */
const active = computed(() => blocked.value === undefined && state.interfacesFolded)
const describedId = useId()
</script>

<template>
  <div class="flex shrink-0 items-center gap-6">
    <button
      type="button"
      class="flex shrink-0 items-center gap-6 rounded-control px-8 py-5 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:text-line disabled:hover:bg-transparent"
      :disabled="blocked !== undefined"
      :aria-pressed="active"
      :aria-describedby="blocked !== undefined ? describedId : undefined"
      @click="state.setInterfacesFolded(!state.interfacesFolded)"
    >
      <span
        class="inline-block min-w-11 rounded-micro border px-4 text-center leading-none"
        :class="active ? 'border-accent-line bg-accent-soft text-accent' : 'border-line'"
        aria-hidden="true"
      >
        {{ active ? '✓' : '' }}
      </span>
      interface を畳む
    </button>

    <!-- 効かない理由。見えるところに出し、口と結び付ける -->
    <span v-if="blocked !== undefined" :id="describedId" class="text-caption text-ink-3">
      {{ blocked }}
    </span>
  </div>
</template>
