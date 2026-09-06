/**
 * 記憶したテーマを最初の描画より前に `<html>` へ載せるための Vite プラグイン（UT-04）。
 *
 * ビルド設定から使うものであり、画面には含まれない。Node 側でしか動かないことを
 * ファイル名（`*.node.ts`）で示し、画面側の型検査から外している（ADR-005）。
 */

import type { Plugin } from 'vite'

import { THEME_BOOTSTRAP_SOURCE } from './theme-keys'

export function themeBootstrapPlugin(): Plugin {
  return {
    name: 'depenomap:theme-bootstrap',
    /*
     * `head-prepend` に置く。スタイルシートより前に走らせて、
     * 最初の描画の時点で属性が載っている状態にする。
     */
    transformIndexHtml: () => [
      { tag: 'script', injectTo: 'head-prepend', children: THEME_BOOTSTRAP_SOURCE },
    ],
  }
}
