/** @type {import("prettier").Config} */
export default {
  // ADR-005: インデントは半角スペース 2 個（.editorconfig と一致させる）
  tabWidth: 2,
  useTabs: false,
  endOfLine: 'lf',

  // Vue エコシステム（create-vue）の既定に合わせる
  semi: false,
  singleQuote: true,
  printWidth: 100,

  // Tailwind v4 は設定ファイルを持たないため、CSS エントリの位置を渡す
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './src/app/design/tokens.css',

  overrides: [
    {
      // 本文の折り返しは書いたままにする。テーブルの整形だけを効かせる
      files: '*.md',
      options: { proseWrap: 'preserve' },
    },
  ],
}
