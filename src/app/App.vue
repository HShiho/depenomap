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

const outcome = ref<FetchGraphOutcome | null>(null)

onMounted(async () => {
  outcome.value = await fetchGraph()
})
</script>

<template>
  <main id="depenomap" class="p-8 font-sans text-sm leading-relaxed">
    <h1 class="text-base font-bold">depenomap</h1>

    <p v-if="outcome === null" class="mt-4">読み込み中…</p>

    <!-- サーバーに届かなかった。正本 JSON の問題ではない -->
    <p v-else-if="!outcome.reached" class="mt-4">グラフを取得できなかった: {{ outcome.message }}</p>

    <template v-else-if="outcome.result.ok">
      <dl class="mt-4">
        <dt class="font-bold">スナップショット</dt>
        <dd>
          {{ outcome.result.graph.meta.snapshot.label }}（{{
            outcome.result.graph.meta.snapshot.branch
          }}）
        </dd>
        <dt class="mt-2 font-bold">規模</dt>
        <dd>
          ノード {{ outcome.result.graph.nodes.length }} / エッジ
          {{ outcome.result.graph.edges.length }}
        </dd>
      </dl>

      <section v-if="outcome.result.warnings.length > 0" class="mt-4">
        <h2 class="font-bold">警告</h2>
        <ul>
          <li v-for="(warning, index) in outcome.result.warnings" :key="index">
            {{ warning.type }}
          </li>
        </ul>
      </section>
    </template>

    <!-- 読み込みには到達したが、正本 JSON が読めなかった -->
    <section v-else class="mt-4">
      <h2 class="font-bold">正本 JSON を読み込めなかった</h2>
      <ul>
        <li v-for="(error, index) in outcome.result.errors" :key="index">{{ error.type }}</li>
      </ul>
    </section>
  </main>
</template>
