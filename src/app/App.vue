<script setup lang="ts">
/*
 * UT-03 の到達点を画面に出すための**暫定表示**。
 *
 * 起動時に指定した正本 JSON が、サーバー経由でここまで届いていることを
 * 目で確かめられる状態にする。画面の骨格（サイドバー・キャンバス・トップバー）と
 * 読み込み結果の見せ方は UT-05 の責務であり、この中身はそこで置き換わる。
 */
import { onMounted, ref } from 'vue'

import { fetchGraph, type FetchGraphOutcome } from '@/core/graph/api'
import { useTheme } from '@/app/design/theme'

const outcome = ref<FetchGraphOutcome | null>(null)

// 切り替えの口（UT-04）。置き場所はトップバー（UT-05）になる
const theme = useTheme()

onMounted(async () => {
  outcome.value = await fetchGraph()
})
</script>

<template>
  <main id="depenomap" class="p-16 text-body">
    <div class="flex items-center gap-12">
      <h1 class="text-brand">depenomap</h1>

      <button
        type="button"
        class="rounded-control border border-line bg-surface-2 px-9 py-4 text-ui text-ink-2 hover:bg-surface-3"
        @click="theme.toggle()"
      >
        配色: {{ theme.resolved.value === 'dark' ? 'ダーク' : 'ライト' }}
        <span class="text-caption text-ink-3">
          （{{ theme.choice.value === 'system' ? 'OS に従う' : '選択中' }}）
        </span>
      </button>
    </div>

    <p v-if="outcome === null" class="mt-16 text-ink-2">読み込み中…</p>

    <!-- サーバーに届かなかった。正本 JSON の問題ではない -->
    <p v-else-if="!outcome.reached" class="mt-16 text-ink-2">
      グラフを取得できなかった: {{ outcome.message }}
    </p>

    <template v-else>
      <dl v-if="outcome.result.ok" class="mt-16">
        <dt class="text-label text-ink-3 uppercase">スナップショット</dt>
        <dd>
          {{ outcome.result.graph.meta.snapshot.label }}（{{
            outcome.result.graph.meta.snapshot.branch
          }}）
        </dd>
        <dt class="mt-9 text-label text-ink-3 uppercase">規模</dt>
        <dd>
          <span class="tabular-nums"
            >ノード {{ outcome.result.graph.nodes.length }} / エッジ
            {{ outcome.result.graph.edges.length }}</span
          >
        </dd>
      </dl>

      <!-- 読み込みには到達したが、正本 JSON が読めなかった -->
      <section v-else class="mt-16">
        <h2 class="text-overline text-ink-3 uppercase">正本 JSON を読み込めなかった</h2>
        <ul>
          <li
            v-for="(error, index) in outcome.result.errors"
            :key="index"
            class="font-mono text-meta"
          >
            {{ error.type }}
          </li>
        </ul>
      </section>

      <!--
        警告は読み込みの成否によらず出す。失敗したときも、そこまでに集まった
        警告は返ってきており（loader.ts）、正本を直す側にとっては
        「整合性が壊れている」と「未知フィールドがある」が同時に見えたほうが速い
      -->
      <section v-if="outcome.result.warnings.length > 0" class="mt-16">
        <h2 class="text-overline text-ink-3 uppercase">警告</h2>
        <ul>
          <li
            v-for="(warning, index) in outcome.result.warnings"
            :key="index"
            class="font-mono text-meta"
          >
            {{ warning.type }}
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
