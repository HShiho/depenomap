<script setup lang="ts">
/**
 * 経由の呼び出しを、どちらの行き先で読むか（UT-30 / UT-07 の見直し）。
 *
 * 正本 JSON は 2 つの事実を持つ。型検査器が返した答え（インターフェース）と、
 * 抽出側が解決した実装である。**どちらも本当のこと**なので、選べるようにする。
 *
 * **メソッド粒度でしか効かない。** ファイル粒度のエッジは `import` であり、
 * 経由の解決はそもそも起きない。その粒度では押せない状態にして、どこで効くのかを
 * **画面に出す**（口ごと消すと、機能が無いのか効かないのかが分からない。
 * ポインタのツールチップだけだと、読み上げにも焦点にも届かない）。
 *
 * 既定は型検査器の答え（UT-07 の決定を残す）。覚えない（UT-30 の決定）。
 */
import { computed } from 'vue'

import { useViewState } from '../shell/view-state'
import SegmentedToggle from './SegmentedToggle.vue'
import type { ViaReading } from './via-reading'

const state = useViewState()

const options: { value: ViaReading; label: string }[] = [
  { value: 'interface', label: 'interface' },
  { value: 'implementation', label: '実装' },
]

/** ファイル粒度では経由の解決が起きない。切り替えても図は変わらない */
const applies = computed(() => state.granularity === 'method')
</script>

<template>
  <SegmentedToggle
    v-model="state.viaReading"
    label="経由の行き先"
    :options="options"
    :disabled="!applies"
    :note="applies ? undefined : 'メソッド粒度で選べます'"
  />
</template>
