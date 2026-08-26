import js from '@eslint/js'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import prettier from 'eslint-config-prettier/flat'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default defineConfigWithVueTs(
  {
    name: 'depenomap/ignores',
    ignores: ['dist/**', 'coverage/**', 'plan/**', '.direnv/**'],
  },
  {
    name: 'depenomap/files',
    files: ['**/*.{ts,mts,cts,vue,js,mjs}'],
  },
  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    name: 'depenomap/globals',
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // 整形に関わるルールは Prettier に任せる。必ず最後に置く
  prettier,
)
