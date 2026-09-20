import { describe, expect, it } from 'vitest'

import { vscodeUriOf } from './vscode-uri'

describe('VSCode で開く URI（UT-18 / US-19）', () => {
  it('ホスト側の絶対パスをそのまま載せる', () => {
    expect(vscodeUriOf('/Users/me/app/src/a.ts')).toBe('vscode://file/Users/me/app/src/a.ts')
  })

  it('位置を渡せば、行と桁を付ける', () => {
    // `loc` は抽出側が 1-based に補正済み（スキーマ §3）
    expect(vscodeUriOf('/Users/me/app/src/a.ts', { line: 42, column: 7 })).toBe(
      'vscode://file/Users/me/app/src/a.ts:42:7',
    )
  })

  it('位置を渡さなければ、行を付けない', () => {
    // 先頭を指すのも「こちらが決めた位置」になる（UT-18 の決定）
    expect(vscodeUriOf('/Users/me/app/src/a.ts')).not.toContain(':1:1')
  })

  it('区切りは残したまま、空白を符号化する', () => {
    // 素のまま載せると、そこで URI が切れて別の場所を指す
    expect(vscodeUriOf('/Users/me/my app/a.ts')).toBe('vscode://file/Users/me/my%20app/a.ts')
  })

  it.each([
    ['#', '/app/a#b.ts', 'vscode://file/app/a%23b.ts'],
    ['?', '/app/a?b.ts', 'vscode://file/app/a%3Fb.ts'],
    ['%', '/app/a%b.ts', 'vscode://file/app/a%25b.ts'],
  ])('%s を含む名前も、その名前として渡す', (_label, hostPath, expected) => {
    expect(vscodeUriOf(hostPath)).toBe(expected)
  })
})
