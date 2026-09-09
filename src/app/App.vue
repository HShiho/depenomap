<script setup lang="ts">
/*
 * 画面の入口。骨格（UT-05）を置き、起動時にグラフを読み込む。
 *
 * 各領域の中身は UT-06 以降が差し込む。いまレールと通知に入っているのは、
 * 器が動いていることを目で確かめるための**暫定表示**である。
 */
import { onMounted } from 'vue'

import AppShell from './shell/AppShell.vue'
import { loadGraphInto } from './shell/graph-source'
import { useViewState } from './shell/view-state'

const state = useViewState()

onMounted(() => void loadGraphInto(state))
</script>

<template>
  <AppShell>
    <template #rail>
      <div class="flex h-full flex-col items-center gap-9 py-9">
        <!-- 一覧の開閉（US-08 の受け皿。操作そのものは UT-12 が置き換える） -->
        <button
          type="button"
          class="rounded-control px-6 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
          :aria-pressed="state.sidebarOpen"
          :aria-label="state.sidebarOpen ? '一覧を閉じる' : '一覧を開く'"
          :title="state.sidebarOpen ? '一覧を閉じる' : '一覧を開く'"
          @click="state.sidebarOpen = !state.sidebarOpen"
        >
          ☰
        </button>

        <div class="grow"></div>

        <button
          type="button"
          class="rounded-control px-6 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
          :aria-label="`配色を切り替え（現在: ${state.themeResolved === 'dark' ? 'ダーク' : 'ライト'}）`"
          :title="`配色を切り替え（現在: ${state.themeResolved === 'dark' ? 'ダーク' : 'ライト'}）`"
          @click="state.toggleTheme()"
        >
          ◐
        </button>
      </div>
    </template>

    <template #sidebar>
      <div class="p-12">
        <h2 class="text-overline text-ink-3 uppercase">ファイル / メソッド</h2>
        <p class="mt-6 text-caption text-ink-3">一覧は UT-12 が置く</p>
      </div>
    </template>

    <template #notice>
      <div class="p-12 text-body">
        <p v-if="state.status.kind === 'loading'" class="text-ink-2">読み込み中…</p>

        <!-- サーバーに届かなかった。正本 JSON の問題ではない -->
        <p v-else-if="state.status.kind === 'unreachable'" class="text-ink-2">
          グラフを取得できなかった: {{ state.status.message }}
        </p>

        <!-- 想定外の失敗。起動の問題でも正本の問題でもない -->
        <p v-else-if="state.status.kind === 'broken'" class="text-ink-2">
          グラフを読み込めなかった: {{ state.status.message }}
        </p>

        <template v-else>
          <dl v-if="state.status.kind === 'ready'">
            <dt class="text-label text-ink-3 uppercase">規模</dt>
            <dd class="tabular-nums">
              ファイル {{ state.viewModel?.nodes.file.length }} / メソッド
              {{ state.viewModel?.nodes.method.length }}
            </dd>
            <dt class="mt-9 text-label text-ink-3 uppercase">粒度</dt>
            <dd>{{ state.granularity === 'file' ? 'ファイル' : 'メソッド' }}</dd>
          </dl>

          <!-- 読み込みには到達したが、正本 JSON が読めなかった -->
          <section v-else>
            <h2 class="text-overline text-ink-3 uppercase">正本 JSON を読み込めなかった</h2>
            <ul>
              <li v-for="(error, index) in state.errors" :key="index" class="font-mono text-meta">
                {{ error.type }}
              </li>
            </ul>
          </section>

          <!-- 警告は読み込みの成否によらず出す -->
          <section v-if="state.warnings.length > 0" class="mt-16">
            <h2 class="text-overline text-ink-3 uppercase">警告</h2>
            <ul>
              <li
                v-for="(warning, index) in state.warnings"
                :key="index"
                class="font-mono text-meta"
              >
                {{ warning.type }}
              </li>
            </ul>
          </section>
        </template>
      </div>
    </template>
  </AppShell>
</template>
