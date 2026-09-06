/**
 * テーマの記憶先と、最初の描画より前に選択を反映するための小さなスクリプト。
 *
 * `theme.ts` から切り出してあるのは、**ビルド設定（`vite.config.ts`）からも
 * 読む**ため。同じキー名を HTML 側にもう一度書くと、片方だけ変えたときに
 * 「記憶しているのに反映されない」という追いにくい壊れ方をする。
 */

/** 選択の記憶先のキー。他の設定と混ざらないよう名前空間を付ける */
export const THEME_STORAGE_KEY = 'depenomap.theme'

/** `<html>` に載せる属性名。`tokens.css` の `[data-theme]` と対になる */
export const THEME_ATTRIBUTE = 'data-theme'

/**
 * `index.html` の `<head>` に同期スクリプトとして差し込む本体。
 *
 * 画面のコード（`theme.ts`）が属性を載せるのは JS の評価後であり、それでは
 * 最初の描画に間に合わない。記憶した選択と OS の設定が食い違う利用者には、
 * 逆のテーマが一瞬見えてから切り替わることになる。ここだけを先に走らせる。
 *
 * 記憶が無い・読めない場合は何もしない。属性が無い状態が「OS に従う」であり、
 * それは CSS 側の既定と一致している。
 *
 * 即時関数で包む。最初の描画より前に走る唯一のコードであり、変数を素で置くと
 * グローバル（`window.choice`）に漏れて、画面側の名前と衝突しうる。
 */
export const THEME_BOOTSTRAP_SOURCE = `(function () {
  try {
    var choice = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (choice === 'light' || choice === 'dark') {
      document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)}, choice);
    }
  } catch (error) {
    /* 記憶を読めない環境では、画面側の切り替えだけが効く */
  }
})()`
