# デザイン基盤（UT-04）

配色・タイポグラフィ・余白・線・影・グラフ描画の値を、ここ 1 箇所に集めている。
**画面側で直値を書かない。** 色もサイズも、必ずここが公開するトークンを経由する。

```
    src/app/design/
      tokens.css     トークンの正（@theme）・ライト／ダークの定義
      fonts.css      書体の読み込み（IBM Plex Mono を同梱）
      theme.ts       テーマ切り替えの口
      README.md      対応表と、拡張するときのルール ← このファイル
```

出典は `plan/inception/design-catalog.html` と `mockup.html`（参照仕様）。
値を変えるときは、まずそちらの意図を読むこと。

---

## トークンの使い方

1 つのトークンは **3 つの顔**を持つ。同じ値を指すので、書きやすいものを選べばよい。

```
    @theme の定義          --color-accent: #0F6E8C;
      │
      ├─▶ ユーティリティ    class="bg-accent text-accent-ink"
      │
      └─▶ CSS 変数         stroke: var(--color-accent);
```

ユーティリティが無い領域（`stroke-dasharray`、`marker-end`、`color-mix` の混合率）
では変数を直接参照する。**そこでも直値は書かない。**

影（`--shadow-float`）だけは `@theme` に置いていない。Tailwind の `shadow-*` は値を
インライン展開してしまい、ダークの上書きが効かなくなるため、生の変数として持ち
`@utility shadow-float` から参照している。使う側から見た形（`class="shadow-float"`）は
他のトークンと同じ。

### Tailwind の既定値は消してある

`tokens.css` の先頭で `--color-*: initial` などを指定し、Tailwind が持っている
既定のパレット・サイズ体系を落としている。

- `bg-red-500` や `text-sm` は**存在しない**（書いても何も効かない）
- 名前で呼べるのは、この README の対応表にあるものだけ

ただし**塞げるのは名前付きの既定値までで、任意値記法は通る**。`bg-[#ff0000]` や
`p-[9px]` はそのまま CSS になる（実際に生成されることを確認済み）。ここはツールでは
止められないので、**レビューで見る**。任意値記法は直値と同じものとして扱う。

### 余白は px そのもの

`--spacing: 1px` にしてあるので、数値ユーティリティは px で読む。

```
    p-9    →  padding: 9px
    gap-7  →  gap: 7px
    mt-16  →  margin-top: 16px
```

この画面は 4px グリッドではなく、実測で詰めた奇数値を許容している（`padding: 9px`、
`gap: 7px`）。4 の倍数に丸める体系にすると、参照仕様の密度をそのまま写せない。

---

## 対応表

`design-catalog.html` の CSS 変数と、この実装のトークン名の対応。

### 色

| カタログ                         | トークン                               | ユーティリティ例              | 用途                                 |
| -------------------------------- | -------------------------------------- | ----------------------------- | ------------------------------------ |
| `--ground`                       | `--color-ground`                       | `bg-ground`                   | アプリの地。キャンバス背景           |
| `--surface`                      | `--color-surface`                      | `bg-surface`                  | パネル・ヘッダ・浮動要素の面         |
| `--surface-2`                    | `--color-surface-2`                    | `bg-surface-2`                | 入力欄・ボタン・行 hover の面        |
| `--surface-3`                    | `--color-surface-3`                    | `bg-surface-3`                | ボタン hover・バーの溝               |
| `--ink`                          | `--color-ink`                          | `text-ink`                    | 主テキスト・見出し・数値             |
| `--ink-2`                        | `--color-ink-2`                        | `text-ink-2`                  | 副テキスト・非選択のラベル           |
| `--ink-3`                        | `--color-ink-3`                        | `text-ink-3`                  | 補助・キャプション・プレースホルダ   |
| `--line`                         | `--color-line`                         | `border-line`                 | 構造の境界                           |
| `--line-2`                       | `--color-line-2`                       | `border-line-2`               | 内部の区切り                         |
| `--accent`                       | `--color-accent`                       | `bg-accent` / `stroke-accent` | 選択・フォーカス・経由辺・主要ボタン |
| `--accent-ink`                   | `--color-accent-ink`                   | `text-accent-ink`             | アクセント面上の文字                 |
| `--accent-soft`                  | `--color-accent-soft`                  | `bg-accent-soft`              | ON 状態の背景・フォーカスリング      |
| `--warn`                         | `--color-warn`                         | `text-warn` / `stroke-warn`   | 循環している依存                     |
| `--warn-soft`                    | `--color-warn-soft`                    | `bg-warn-soft`                | 同上の面                             |
| `--layer-presentation` ほか 5 色 | `--color-layer-1` 〜 `--color-layer-6` | `fill-layer-3`                | 層の識別（下記）                     |
| `--tint`                         | `--tint`                               | （変数のみ）                  | 層カラーをノード面に混ぜる割合       |
| `--shadow`                       | `--shadow-float`（生の変数）           | `shadow-float`                | 浮いている要素だけ                   |

### 書体・余白

| カタログ              | トークン           | ユーティリティ例          | 用途                                                                                                    |
| --------------------- | ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| IBM Plex Sans JP ほか | `--font-sans`      | `font-sans`               | 説明文・ラベル・日本語。**カタログの Plex Sans JP は同梱せず OS の書体に置き換えている**（`fonts.css`） |
| IBM Plex Mono         | `--font-mono`      | `font-mono`               | 識別子（ファイル名・メソッド名・パス）                                                                  |
| （実測の px 値）      | `--spacing`（1px） | `p-9` / `gap-7` / `mt-16` | 余白。数値がそのまま px                                                                                 |

### 文字

カタログのタイプスケール 15 段を、そのままトークン名にしている。
サイズ・太さ・字間・行間はトークン側が持つので、`text-overline` のように 1 つ書けばよい
（大文字化だけは `uppercase` を併記する）。

```
    metric-xl  23px/600     metric-l 19px/600    title-mono 15px/600   title 15px
    brand      13.5px/700   body     13px        name       12.5px     ui    12px
    meta       11.5px       caption  11px        overline   11px/600   label 10.5px
    kicker     10px         micro    9.5px       flag       9px/700
```

数値には `tabular-nums`（Tailwind の標準ユーティリティ）を付ける。件数やズーム率が
更新されたときに桁が揺れない。

### 角丸

| トークン           | 値    | 用途                             |
| ------------------ | ----- | -------------------------------- |
| `--radius-micro`   | 2px   | 色帯・凡例の四角                 |
| `--radius-focus`   | 4px   | フォーカスリングの角             |
| `--radius-inner`   | 6px   | セグメント内ボタン・メニュー項目 |
| `--radius-control` | 7px   | ボタン・入力欄・トグル           |
| `--radius-item`    | 8px   | 一覧の行・統計ブロック           |
| `--radius-float`   | 9px   | ツールチップ・メニュー・トースト |
| `--radius-panel`   | 10px  | 凡例・カード・表の外枠           |
| `--radius-modal`   | 14px  | 概要シート                       |
| `--radius-round`   | 999px | バッジ・pill・チップ             |

### グラフ描画（SVG）

線幅・破線・不透明度はユーティリティを持たないので、変数として参照する。

```
    ノード      --node-stroke / --node-stroke-selected / --node-stroke-cyclic
                --node-dash-cyclic / --node-opacity-dimmed
    辺          --edge-stroke / --edge-stroke-implements / --edge-stroke-via
                --edge-stroke-cyclic / --edge-stroke-emphasis / --edge-stroke-hit
                --edge-dash-implements / --edge-dash-cyclic / --edge-dash-unresolved
                --edge-opacity / --edge-opacity-implements / --edge-opacity-dimmed
```

状態は**枠線の色・太さ・破線パターン**だけで表し、塗りは変えない。

---

## 層カラーの割り当て

正本 JSON は層の色を持たない（`layers[].color` は「見た目はビューアの責務」として
意図的に無い）。層 ID もプロジェクト固有の文字列で、`presentation` のような名前が来る
保証はない。したがって**名前では割り当てない**。

```
    layers[0] ─▶ --color-layer-1
    layers[1] ─▶ --color-layer-2
        …
    layers[5] ─▶ --color-layer-6
    layers[6] ─▶ --color-layer-1  （6 色を超えたら循環）
```

割り当てた色は要素側の `--lc` に代入し、面と枠はそこから派生させる。

```css
/* ノード 1 つ分。--lc に層の色が入っている前提 */
.node {
  fill: color-mix(in srgb, var(--lc) var(--tint), var(--color-surface));
  stroke: color-mix(in srgb, var(--lc) 46%, var(--color-line));
}
```

色は**識別のためだけ**にある。層の序列や良し悪しを表さない（N-1）。

---

## テーマ切り替えの口

`theme.ts` が公開する。状態は 3 つで、既定は「OS に従う」。

```
    choice: 'light' | 'dark' | 'system'      利用者の選択（system = OS に従う）
    resolved: 'light' | 'dark'               実際に適用されている見た目

    select(choice)   選び直す。system を選ぶと記憶を消す
    toggle()         いま見えている見た目の逆にする（明示的な選択になる）
    dispose()        OS 設定の購読をやめる
```

```
    選択          <html data-theme>     効く定義
    ───────────────────────────────────────────────────────────
    light         data-theme="light"    :root（ライトの値）
    dark          data-theme="dark"     :root[data-theme="dark"]
    system        属性なし              OS がダークなら @media 側が効く
```

選択は `localStorage`（`depenomap.theme`）に記憶する。表示状態は揮発させる決まりだが
（C-3）、それは依存グラフの見え方の話で、テーマは閲覧環境の設定なので別に扱う。
記憶できない環境（プライベートウィンドウ・保存の禁止）では、記憶だけが落ちて
切り替えは動く。

---

## 拡張するときのルール

### ◯ こうする

- **色は必ずトークン経由**。層の色は `--lc` に代入して `color-mix` で派生させる
- **トークンを足したら、ライトとダークの両方に書く**。ダーク側は 2 か所
  （`@media (prefers-color-scheme: dark)` と `:root[data-theme="dark"]`）に同じ値を書く。
  片方にしか無いトークンを作らない
- **トークンを足したら、この README の対応表も更新する**。対応表に無い名前は、
  他の UT から見て「無い」のと同じ
- 新しいサイズが要るときは、まず既存の 15 段のどれかで足りないか確認する
- 状態は `aria-pressed` / `data-*` に持たせ、CSS は属性セレクタで受ける
- 数値表示には `tabular-nums`
- 依存の形（循環・interface 経由・追跡できなかった依存）は、**線種と語ラベル**で区別する
- 影は浮動要素（チップ・凡例・メニュー・トースト）にだけ付ける

### ✕ こうしない

- **直値を書く**（`#fff`、`13px`、`padding: 9px`）。トークンが無いなら、まずトークンを足す
- **任意値記法を使う**（`bg-[#fff]`、`p-[9px]`、`text-[13px]`）。名前付きの既定値と違い
  ツールでは止まらないが、扱いは直値と同じ
- **良し悪しを示す色や語**（違反・エラー・要修正・健全）の持ち込み。判定はこのツールの
  責務ではない（N-1）。意味を持つ色は「循環している依存」の `--warn` 系だけ
- 16px 以上の本文サイズ（この画面の密度が崩れる）
- グラデーション・角丸 16px 超・カラー影などの装飾
- パネルやカードへの影の付与
- 意味を持たない色の追加。分類を増やすなら層カラーの体系に足す
- 日本語ラベルへの `text-transform: uppercase`（効かない）
- アイコンのみのボタンを `aria-label` なしで置くこと

### トークンを足す基準

足す前に、次の順で確認する。

```
    1. 既存のトークンで表せないか
         └─ 表せるなら足さない。名前が用途と違うだけなら、用途の側を疑う

    2. その値は「意味」を持つか
         └─ 持たないなら足さない（同じ色の別名を増やさない）

    3. 良し悪しの判定を表そうとしていないか
         └─ 表しているなら、まず責務の内側か（N-1）を確認する

    4. ライトとダークの両方の値を決められるか
         └─ 決められないなら、まだ足さない
```
